/**
 * The spreadsheet library is large, so it is fetched the first time a file is
 * read or made, never with the page that only offers the button.
 *
 * If it cannot be fetched (offline, a deploy in progress) the error reads as a
 * plain sentence, ready to show to the person who tapped.
 */
export async function loadXlsx() {
  try {
    return await import("xlsx");
  } catch {
    throw new Error(
      "The spreadsheet tool could not be loaded. Check the connection and try again.",
    );
  }
}

/**
 * Start fetching it early (when the menu or dialog that needs it opens), so
 * the tap that makes the file does not wait on the network.
 */
export function warmXlsx(): void {
  void loadXlsx().catch(() => {
    /* the real call reports it */
  });
}
