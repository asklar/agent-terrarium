import { invoke } from "@tauri-apps/api/core";

export async function setCredential(backendId: string, key: string): Promise<void> {
    await invoke("set_credential", { backendId, key });
}

export async function getCredential(backendId: string): Promise<string | null> {
    return await invoke<string | null>("get_credential", { backendId });
}

export async function deleteCredential(backendId: string): Promise<void> {
    await invoke("delete_credential", { backendId });
}

export async function hasCredential(backendId: string): Promise<boolean> {
    return await invoke<boolean>("has_credential", { backendId });
}
