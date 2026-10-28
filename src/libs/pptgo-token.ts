// PPTGo 与 BoardMix 同属 Bosyun 体系，登录态保存在 localStorage 的
// BOSYUNCurrent 中（JSON，含 access_token / refresh_token）。

export const PPTGO_ORIGIN = "https://pptgo.cn";
export const PPTGO_PARTITION = "persist:pptgo";
export const PPTGO_EDITOR_BASE = "https://pptgo.cn/app/editor/";
export const PPTGO_LOGIN_URL =
    "https://pptgo.cn/user/login/?response_type=none&redirect_uri=https%3A%2F%2Fpptgo.cn%2Fapp%2Fmy-file&from=1&product=pptgo&ux_mode=redirect";

export function parseToken(raw: string | null | undefined): string {
    if (!raw) return "";
    try {
        return JSON.parse(raw)?.["access_token"] || "";
    } catch (err) {
        return "";
    }
}

/**
 * 从任意已打开的 PPTGo 页面读取最新的 access_token。
 * 页面里的 cas-client 会自动刷新 token，所以这里读到的通常比插件里
 * 保存的副本更新，可以避免 token 过期后必须手动重新登录。
 */
export async function readTokenFromPptgoPages(): Promise<string> {
    try {
        const remote = (window as any).require("@electron/remote");
        const list = remote.webContents?.getAllWebContents?.() ?? [];
        for (const wc of list) {
            let url = "";
            try {
                url = wc.getURL() || "";
            } catch (err) {
                continue;
            }
            if (!url.startsWith(PPTGO_ORIGIN)) continue;
            try {
                const raw = await wc.executeJavaScript(
                    "localStorage.getItem('BOSYUNCurrent')",
                    true,
                );
                const token = parseToken(raw);
                if (token) return token;
            } catch (err) {
                /* ignore */
            }
        }
    } catch (err) {
        console.warn("pptgo: enumerate webContents failed", err);
    }
    return "";
}

/** 退出登录：清掉所有 PPTGo 页面与本插件 partition 中的登录态 */
export async function clearPptgoLoginState() {
    try {
        const remote = (window as any).require("@electron/remote");
        const list = remote.webContents?.getAllWebContents?.() ?? [];
        for (const wc of list) {
            let url = "";
            try {
                url = wc.getURL() || "";
            } catch (err) {
                continue;
            }
            if (!url.startsWith(PPTGO_ORIGIN)) continue;
            try {
                await wc.executeJavaScript(
                    "localStorage.removeItem('BOSYUNCurrent')",
                );
            } catch (err) {
                /* ignore */
            }
        }
        await remote.session
            .fromPartition(PPTGO_PARTITION)
            .clearStorageData({ storages: ["cookies", "localstorage"] });
    } catch (err) {
        console.warn("pptgo: clear login state failed", err);
    }
}
