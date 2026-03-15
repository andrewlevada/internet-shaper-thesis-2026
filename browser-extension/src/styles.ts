import { css } from "lit";

export const styles = css`
  .overlay-container {
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    background: #ffffff;
    color: #111111;
    font-family: system-ui, -apple-system, sans-serif;
  }

  .modal-container {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    min-width: 400px;
    max-width: 600px;
    max-height: 80vh;
    overflow-y: auto;
    padding: 16px;
    background: #ffffff;
    color: #111111;
    font-family: system-ui, -apple-system, sans-serif;
  }

  .row {
    display: flex;
    gap: 8px;
  }

  .row-between {
    display: flex;
    gap: 8px;
    justify-content: space-between;
    align-items: center;
  }

  .input {
    width: 320px;
    padding: 10px 14px;
    border: none;
    background: #eeeeee;
    font-size: 14px;
    outline: none;
  }

  .btn {
    padding: 10px 20px;
    border: none;
    background: #eeeeee;
    font-size: 14px;
    cursor: pointer;
  }

  .btn-sm {
    padding: 6px 12px;
    border: none;
    background: #eeeeee;
    font-size: 12px;
    cursor: pointer;
  }

  .btn-close {
    padding: 10px 12px;
    border: none;
    background: #eeeeee;
    font-size: 14px;
    cursor: pointer;
  }

  .btn-close-sm {
    padding: 4px 8px;
    border: none;
    background: #eeeeee;

    cursor: pointer;
  }

  .btn-full {
    margin-top: 12px;
    padding: 10px 16px;
    border: none;
    background: #eeeeee;
    cursor: pointer;
    width: 100%;
  }

  .btn-delete {
    padding: 4px 8px;
    border: none;
    background: #ffffff;
    cursor: pointer;
  }

  .status {
    font-size: 12px;
    flex: 1;
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
  }

  .modal-title {
    margin: 0;
    font-size: 16px;
  }

  .rule-card {
    padding: 12px;
    margin-bottom: 8px;
    background: #eeeeee;
  }

  .rule-title {
    font-size: 14px;
  }

  .rule-selector {
    display: block;
    font-size: 11px;
    word-break: break-all;
  }

  .rule-logic {
    display: block;
    margin-top: 8px;
    padding: 8px;
    background: #ffffff;
    font-family: monospace;
    font-size: 11px;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .switch {
    position: relative;
    width: 36px;
    height: 20px;
    background: #cccccc;
    border-radius: 10px;
    cursor: pointer;
    transition: background 0.2s;
  }

  .switch-enabled {
    background: #4caf50;
  }

  .switch::after {
    content: "";
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    background: #ffffff;
    border-radius: 50%;
    transition: transform 0.2s;
  }

  .switch-enabled::after {
    transform: translateX(16px);
  }

  .disabled {
    opacity: 0.5;
  }

  * {
    color: inherit;
  }
`;
