export interface UpdateRule {
  query_selector: string;
  logic: string;
}

export interface AgentLogEntry {
  timestamp: string;
  domName: string;
  request: string;
  rules: UpdateRule[];
  agentResponse: unknown;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}
