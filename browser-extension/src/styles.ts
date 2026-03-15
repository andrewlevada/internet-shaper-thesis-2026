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
    background: #f;
    color: #1;
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
    background: #f;
    color: #1;
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
    background: #e;
    color: #1;
    font-size: 14px;
    outline: none;
  }

  .btn {
    padding: 10px 20px;
    border: none;
    background: #e;
    color: #1;
    font-size: 14px;
    cursor: pointer;
  }

  .btn-sm {
    padding: 6px 12px;
    border: none;
    background: #e;
    color: #1;
    font-size: 12px;
    cursor: pointer;
  }

  .btn-close {
    padding: 10px 12px;
    border: none;
    background: #e;
    color: #1;
    font-size: 14px;
    cursor: pointer;
  }

  .btn-close-sm {
    padding: 4px 8px;
    border: none;
    background: #e;
    color: #1;
    cursor: pointer;
  }

  .btn-full {
    margin-top: 12px;
    padding: 10px 16px;
    border: none;
    background: #e;
    color: #1;
    cursor: pointer;
    width: 100%;
  }

  .btn-delete {
    padding: 4px 8px;
    border: none;
    background: #f;
    color: #1;
    cursor: pointer;
  }

  .status {
    font-size: 12px;
    color: #1;
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

  .empty-text {
    color: #1;
  }

  .rule-card {
    padding: 12px;
    margin-bottom: 8px;
    background: #e;
  }

  .rule-title {
    font-size: 14px;
  }

  .rule-selector {
    display: block;
    margin-top: 8px;
    font-size: 11px;
    color: #1;
    word-break: break-all;
  }
`;
