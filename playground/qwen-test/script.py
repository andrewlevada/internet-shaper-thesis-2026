import torch
from tqdm.auto import tqdm
from transformers import AutoProcessor, AutoModelForImageTextToText
from transformers.generation.stopping_criteria import StoppingCriteria, StoppingCriteriaList

# if torch.backends.mps.is_available():
#     device = torch.device("mps")
#     print("Using MPS!")
# elif torch.cuda.is_available():
#     device = torch.device("cuda")
#     print("Using CUDA!")
# else:
device = torch.device("cpu")
print("Using CPU :(")

dtype = torch.float16 if device.type in ("mps", "cuda") else torch.float32

# Long DOMs blow up prompt KV / attention buffers on MPS; cap prompt tokens and truncate.
MAX_INPUT_TOKENS = 2 ** 16
max_new_tokens = 128

task_prompt = """
You are given a web page's compressed DOM snapshot. Your task is to describe what the page is about and what the user can do on it.
"""

# loading from 90 exp
dom_snapshot = open("../90-dom-whitespace-normalization/output/from-03/substack.html").read()

processor = AutoProcessor.from_pretrained("Qwen/Qwen3.5-0.8B-Base")
model = AutoModelForImageTextToText.from_pretrained(
    "Qwen/Qwen3.5-0.8B-Base",
    dtype=dtype, # torch_dtype is deprecated
).to(device)

model.eval()

model_ctx = getattr(model.config, "max_position_embeddings", MAX_INPUT_TOKENS + max_new_tokens)
prompt_token_budget = min(
    MAX_INPUT_TOKENS,
    max(model_ctx - max_new_tokens - 128, 512),
)

messages = [
    {
        "role": "user",
        "content": [
            {"type": "text", "text": task_prompt}
        ]
    },
    {
        "role": "user",
        "content": [
            {"type": "text", "text": dom_snapshot},
        ]
    }
]

# Processor.chat_template is unset for this checkpoint; tokenizer_config.json carries the template.
inputs = processor.apply_chat_template(
	messages,
	chat_template=processor.tokenizer.chat_template,
	add_generation_prompt=True,
	tokenize=True,
	return_dict=True,
	return_tensors="pt",
	truncation=True,
	max_length=prompt_token_budget,
).to(device)

prompt_len = inputs["input_ids"].shape[-1]
print(f"Prompt tokens (after truncation): {prompt_len} / budget {prompt_token_budget}")

if device.type == "mps":
	torch.mps.empty_cache()

class GenerationStepProgressBar(StoppingCriteria):
    def __init__(self, total: int, desc: str = "Generating") -> None:
        self._pbar = tqdm(total=total, desc=desc, unit="tok", dynamic_ncols=True)

    def __call__(self, input_ids: torch.LongTensor, scores: torch.FloatTensor, **kwargs) -> torch.Tensor:
        self._pbar.update(1)
        return torch.zeros(input_ids.shape[0], dtype=torch.bool, device=input_ids.device)

    def close(self) -> None:
        self._pbar.close()

progress = GenerationStepProgressBar(max_new_tokens)
try:
    outputs = model.generate(
        **inputs,
        max_new_tokens=max_new_tokens,
        stopping_criteria=StoppingCriteriaList([progress]),
    )
finally:
    progress.close()

print(processor.tokenizer.decode(outputs[0][inputs["input_ids"].shape[-1]:]))