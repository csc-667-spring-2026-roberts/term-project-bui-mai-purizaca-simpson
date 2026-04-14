// ---------------------------------------------------------------------------
// Store — single source of truth for client-side state
// SSE events flow in and update this; the UI re-renders from it.
// ---------------------------------------------------------------------------

interface StoreState {
  connectionStatus: "connected" | "disconnected" | "reconnecting";
  lastEvent: { type: string; data: unknown } | null;
}

const store: StoreState = {
  connectionStatus: "disconnected",
  lastEvent: null,
};

type StoreListener = (state: StoreState) => void;
const storeListeners: StoreListener[] = [];

function updateStore(patch: Partial<StoreState>): void {
  Object.assign(store, patch);
  for (const listener of storeListeners) {
    listener(store);
  }
}

function onStoreChange(listener: StoreListener): void {
  storeListeners.push(listener);
}

// ---------------------------------------------------------------------------
// SSE connection — state comes DOWN from server via EventSource
// EventSource auto-reconnects on network failure (built-in browser behavior)
// ---------------------------------------------------------------------------

function connectSSE(): void {
  const eventSource = new EventSource("/api/sse");

  eventSource.addEventListener("open", () => {
    updateStore({ connectionStatus: "connected" });
  });

  eventSource.addEventListener("error", () => {
    // EventSource will automatically attempt to reconnect
    updateStore({ connectionStatus: "reconnecting" });
  });

  eventSource.addEventListener("message", (event: MessageEvent) => {
    const rawData = event.data as string;
    const data: unknown = JSON.parse(rawData);
    updateStore({ lastEvent: { type: "message", data } });
  });
}

// ---------------------------------------------------------------------------
// Render SSE connection status to the DOM
// ---------------------------------------------------------------------------

function renderConnectionStatus(state: StoreState): void {
  const statusEl = document.getElementById("sse-status");
  if (!(statusEl instanceof HTMLElement)) return;

  statusEl.textContent = state.connectionStatus;
  statusEl.className = `sse-status sse-status--${state.connectionStatus}`;
}

// ---------------------------------------------------------------------------
// Activity demo — existing feature (unchanged)
// ---------------------------------------------------------------------------

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
    const response = await fetch("/test", {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Request failed with status ${String(response.status)}`);
    }

    const records: TestRow[] = (await response.json()) as TestRow[];

    clearContainer(container);

    for (const record of records) {
      const fragment = template.content.cloneNode(true);

      if (!(fragment instanceof DocumentFragment)) {
        continue;
      }

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

      idElement.textContent = String(record.id);
      messageElement.textContent = record.message;
      createdAtElement.textContent = new Date(record.created_at).toLocaleString();

      container.appendChild(fragment);
    }
  } catch (error) {
    clearContainer(container);

    const errorMessage = document.createElement("p");
    errorMessage.textContent = "Failed to load activity.";
    container.appendChild(errorMessage);

    console.error(error);
  } finally {
    button.disabled = false;
    button.textContent = "Load Activity";
  }
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

onStoreChange(renderConnectionStatus);
connectSSE();

const loadButton = document.getElementById("load-activity-btn");
if (loadButton instanceof HTMLButtonElement) {
  loadButton.addEventListener("click", () => {
    void loadActivity();
  });
}
