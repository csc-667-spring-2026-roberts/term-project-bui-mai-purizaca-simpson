/**
 * Store — keeps track of everything the page needs to know
 */

interface StoreState {
  // connectionStatus: are we connected to the server right now, or not?
  connectionStatus: "connected" | "disconnected" | "reconnecting";
  // lastEvent: the most recent message we got from the server
  lastEvent: { type: string; data: unknown } | null;
}

const store: StoreState = {
  connectionStatus: "disconnected",
  lastEvent: null,
};

// a list of functions to call whenever the store changes.
type StoreListener = (state: StoreState) => void;
// any part of the page that needs to react to updates registers itself here.
const storeListeners: StoreListener[] = [];

// updates the store with new data, then notifies every listener.
function updateStore(patch: Partial<StoreState>): void {
  // patch = the desired fields to change so not everything has to be passed.
  Object.assign(store, patch);
  for (const listener of storeListeners) {
    listener(store);
  }
}

// Register a function to be called whenever the store changes.
function onStoreChange(listener: StoreListener): void {
  storeListeners.push(listener);
}

/**
 * SSE connection — opens a live connection to the server
 * The server can push messages to us at any time through this connection.
 * If the connection drops, the browser will automatically try to reconnect.
 */
function connectSSE(): void {
  // open a persistent connection to the server's SSE endpoint.
  const eventSource = new EventSource("/api/sse");

  // runs when the connection is successfully established
  eventSource.addEventListener("open", () => {
    updateStore({ connectionStatus: "connected" });
  });

  // runs when the connection drops or something goes wrong.
  eventSource.addEventListener("error", () => {
    // EventSource will automatically attempt to reconnect
    updateStore({ connectionStatus: "reconnecting" });
  });

  // runs every time the server sends us a new message.
  eventSource.addEventListener("message", (event: MessageEvent) => {
    const rawData = event.data as string;
    const data: unknown = JSON.parse(rawData);
    updateStore({ lastEvent: { type: "message", data } });
  });
}

/**
 *  Updates the connection status text shown on the page
 *  Called automatically whenever the store changes
 */
function renderConnectionStatus(state: StoreState): void {
  // Find the element on the page that displays the connection status
  const statusEl = document.getElementById("sse-status");
  if (!(statusEl instanceof HTMLElement)) return;

  // Update the text and CSS class so it can be styled differently
  statusEl.textContent = state.connectionStatus;
  statusEl.className = `sse-status sse-status--${state.connectionStatus}`;
}

/**
 * Loads and displays recent activity from the server
 */

// Describes what a single activity record looks like when it comes from the server
type TestRow = {
  id: number;
  message: string;
  created_at: string;
};

function clearContainer(container: HTMLElement): void {
  while (container.firstChild !== null) {
    container.removeChild(container.firstChild);
  }
}

// Triggered when the user clicks the "Load Activity" button.
async function loadActivity(): Promise<void> {
  const button = document.getElementById("load-activity-btn");
  const container = document.getElementById("activity-list");
  const template = document.getElementById("activity-item-template");

  if (
    !(button instanceof HTMLButtonElement) ||
    !(container instanceof HTMLDivElement) ||
    !(template instanceof HTMLTemplateElement)
  ) {
    return;
  }

  button.disabled = true;
  button.textContent = "Loading...";

  try {
    // Ask the server for the activity data
    const response = await fetch("/test", {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    // If the server returned an error, throw so we jump to the catch block
    if (!response.ok) {
      throw new Error(`Request failed with status ${String(response.status)}`);
    }

    // Parse the response as a list of activity records
    const records: TestRow[] = (await response.json()) as TestRow[];

    // Wipe the current list before rendering the fresh data
    clearContainer(container);

    // For each record, clone the HTML template and fill in the data
    for (const record of records) {
      const fragment = template.content.cloneNode(true);

      if (!(fragment instanceof DocumentFragment)) {
        continue;
      }

      // Find the placeholder elements inside the cloned template
      const idElement = fragment.querySelector(".activity-id");
      const messageElement = fragment.querySelector(".activity-message");
      const createdAtElement = fragment.querySelector(".activity-created-at");

      if (
        !(idElement instanceof HTMLElement) ||
        !(messageElement instanceof HTMLElement) ||
        !(createdAtElement instanceof HTMLElement)
      ) {
        continue;
      }

      // Fill in the data for this record
      idElement.textContent = String(record.id);
      messageElement.textContent = record.message;
      createdAtElement.textContent = new Date(record.created_at).toLocaleString();

      // Add the filled-in item to the page
      container.appendChild(fragment);
    }
  } catch (error) {
    clearContainer(container);

    const errorMessage = document.createElement("p");
    errorMessage.textContent = "Failed to load activity.";
    container.appendChild(errorMessage);

    console.error(error);
  } finally {
    // Always re-enable the button when we're done, success or failure
    button.disabled = false;
    button.textContent = "Load Activity";
  }
}

/**
 * Startup — runs when the page loads
 */

// Tell the store to call renderConnectionStatus whenever anything changes
onStoreChange(renderConnectionStatus);
// Open the SSE connection to the server so we can receive live updates
connectSSE();

// Wire up the Load Activity button so clicking it triggers loadActivity()
const loadButton = document.getElementById("load-activity-btn");
if (loadButton instanceof HTMLButtonElement) {
  loadButton.addEventListener("click", () => {
    void loadActivity();
  });
}
