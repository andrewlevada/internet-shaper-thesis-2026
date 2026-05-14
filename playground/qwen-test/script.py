from transformers import AutoProcessor, AutoModelForImageTextToText

processor = AutoProcessor.from_pretrained("Qwen/Qwen3.5-0.8B-Base")
model = AutoModelForImageTextToText.from_pretrained("Qwen/Qwen3.5-0.8B-Base")
messages = [
    {
        "role": "user",
        "content": [
            {"type": "text", "text": "Hello! What is 6+90?"}
        ]
    },
]

# Processor.chat_template is unset for this checkpoint; tokenizer_config.json carries the template.
inputs = processor.apply_chat_template(
	messages,
	chat_template=processor.tokenizer.chat_template,
	add_generation_prompt=True,
	tokenize=True,
	return_dict=True,
	return_tensors="pt",
).to(model.device)

outputs = model.generate(**inputs, max_new_tokens=40)
print(processor.tokenizer.decode(outputs[0][inputs["input_ids"].shape[-1]:]))