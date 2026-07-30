/**
 * Shared state machine for scoped CRUD managers (skills, MCP servers):
 * list loading with retry, a create/edit dialog, and a delete confirmation.
 * Operations throw an Error whose message is shown to the user.
 */
export function createManagerState<T>(ops: {
  list: () => Promise<T[]>;
  remove: (item: T) => Promise<void>;
}) {
  let items = $state<T[] | null>(null);
  let listError = $state<string | null>(null);

  let dialogOpen = $state(false);
  let editing = $state(false);
  let formError = $state<string | null>(null);
  let saving = $state(false);

  let deleteTarget = $state<T | null>(null);
  let deleting = $state(false);
  let deleteError = $state<string | null>(null);

  const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

  async function load() {
    try {
      items = await ops.list();
      listError = null;
    } catch (err) {
      listError = message(err);
    }
  }

  function retry() {
    listError = null;
    load();
  }

  function openDialog(edit: boolean) {
    editing = edit;
    formError = null;
    dialogOpen = true;
  }

  /** Run a validated submit; on success close the dialog and reload the list. */
  async function save(submit: () => Promise<void>) {
    saving = true;
    try {
      await submit();
      dialogOpen = false;
      await load();
    } catch (err) {
      formError = message(err);
    }
    saving = false;
  }

  function openDelete(item: T) {
    deleteTarget = item;
    deleteError = null;
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    deleting = true;
    try {
      await ops.remove(deleteTarget);
      deleteTarget = null;
      await load();
    } catch (err) {
      deleteError = message(err);
    }
    deleting = false;
  }

  return {
    get items() {
      return items;
    },
    get listError() {
      return listError;
    },
    get dialogOpen() {
      return dialogOpen;
    },
    set dialogOpen(value: boolean) {
      dialogOpen = value;
    },
    get editing() {
      return editing;
    },
    get formError() {
      return formError;
    },
    set formError(value: string | null) {
      formError = value;
    },
    get saving() {
      return saving;
    },
    get deleteTarget() {
      return deleteTarget;
    },
    set deleteTarget(value: T | null) {
      deleteTarget = value;
    },
    get deleting() {
      return deleting;
    },
    get deleteError() {
      return deleteError;
    },
    load,
    retry,
    openDialog,
    save,
    openDelete,
    confirmDelete,
  };
}
