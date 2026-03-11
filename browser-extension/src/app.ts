import { overlay } from "fiber-extension";
import { html } from "lit";

function handleSubmit() {
  const input = document.getElementById("shaper-input") as HTMLInputElement;
  if (input?.value.trim()) {
    console.log("Shaping intent:", input.value);
    // TODO: Process the shaping intent
  }
}

async function main() {
  console.log("Internet Shaper loaded");

  overlay.attachOnAction(html`
    <div
      style="position: fixed;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        gap: 8px;
        padding: 8px;
        background: rgba(26, 26, 26, 0.95);
        backdrop-filter: blur(12px);
        border-radius: 12px;
        box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
        font-family: system-ui, -apple-system, sans-serif;"
      >
        <input
          id="shaper-input"
          type="text"
          placeholder="What do you want to change?"
          @keydown="${(e: KeyboardEvent) =>
            e.key === "Enter" && handleSubmit()}"
          style="width: 320px;
            padding: 10px 14px;
            border: none;
            border-radius: 8px;
            background: rgba(255, 255, 255, 0.1);
            color: white;
            font-size: 14px;
            outline: none;"
          />
          <button
            @click="${handleSubmit}"
            style="padding: 10px 20px;
              border: none;
              border-radius: 8px;
              background: #6366f1;
              color: white;
              font-size: 14px;
              font-weight: 500;
              cursor: pointer;
              transition: background 0.15s;"
            @mouseover="${(e: Event) =>
              (e.target as HTMLElement).style.background = "#4f46e5"}"
            @mouseout="${(e: Event) =>
              (e.target as HTMLElement).style.background = "#6366f1"}"
          >
            Shape
          </button>

          <button
            @click="${() => overlay.hide()}"
            style="padding: 10px 12px;
              border: none;
              border-radius: 8px;
              background: rgba(255, 255, 255, 0.1);
              color: rgba(255, 255, 255, 0.7);
              font-size: 14px;
              cursor: pointer;
              transition: background 0.15s;"
            @mouseover="${(e: Event) =>
              (e.target as HTMLElement).style.background =
                "rgba(255, 255, 255, 0.15)"}"
            @mouseout="${(e: Event) =>
              (e.target as HTMLElement).style.background =
                "rgba(255, 255, 255, 0.1)"}"
          >
            ✕
          </button>
        </div>
      `);
    }

    main();
