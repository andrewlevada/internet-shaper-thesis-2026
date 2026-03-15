export interface UpdateRule {
  label: string; // ~3 word description for display in rule management UI
  query_selector: string;
  logic: string;
}
