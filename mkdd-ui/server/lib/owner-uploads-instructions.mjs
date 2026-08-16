/**
 * Employee instructions for MKDD's owner file-upload feature
 * (BUGS_AND_FIXES.md #58).
 *
 * The owner can upload real project assets (product photos, reference
 * documents, brand assets, etc.) directly from the Project Home screen,
 * landing in the project's own shared directory - not tied to any
 * single employee's conversation.
 */

/** Instruction text every employee's system prompt gets, once (see bootstrap-employees.mjs). */
export const OWNER_UPLOADS_INSTRUCTIONS = `## Owner-Uploaded Project Assets

The owner can upload real files directly into this project (product
photos, reference documents, brand assets, etc.) from the Project Home
screen - not through this conversation. These land in:

  {your-project-directory}/uploads/

Before doing prototype/design/content work where a real asset would
matter (e.g. product photos for an e-commerce catalog, a logo, a
reference document), check this folder first:

  ls uploads/ 2>/dev/null

If real assets are there for what you're working on, use them instead
of a generic placeholder or a stock image you'd otherwise have to find
yourself - the owner uploaded them specifically because they're the
real thing. If the folder is empty or doesn't have what you need for a
specific piece of content, proceed with a clearly-labeled placeholder
as usual and mention to the owner that a real asset would improve it.`;
