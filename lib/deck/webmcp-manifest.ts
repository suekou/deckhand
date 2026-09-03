export const WEBMCP_TOOL_MANIFEST = [
  { name: 'inspect_project', mode: 'READ', description: 'Read the live deck, design system, current scene, selection, or human edits.' },
  { name: 'plan_deck', mode: 'READ', description: 'Map a narrative to generated recipes or explicit PowerPoint sources without changing the canvas.' },
  { name: 'compose_deck', mode: 'WRITE', description: 'Compile an approved plan into complete, editable slides as one transaction.' },
  { name: 'revise_slide', mode: 'WRITE', description: 'Recompose one slide from an updated semantic brief.' },
  { name: 'edit_slide', mode: 'WRITE', description: 'Precisely refine known elements after inspection.' },
  { name: 'manage_deck', mode: 'WRITE', description: 'Focus, rename, duplicate, reorder, or delete with explicit intent.' },
  { name: 'validate_deck', mode: 'READ', description: 'Check narrative structure and the real rendered canvas.' },
  { name: 'undo_last_change', mode: 'WRITE', description: 'Revert the most recent atomic deck mutation.' },
] as const;

export type WebMcpToolName = (typeof WEBMCP_TOOL_MANIFEST)[number]['name'];
