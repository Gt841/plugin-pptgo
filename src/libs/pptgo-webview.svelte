<script lang="ts">
    import { onDestroy } from "svelte";
    import { pushErrMsg } from "@/libs/api";
    import { store_logged_in } from "@/libs/store";
    import {
        PPTGO_ORIGIN,
        PPTGO_PARTITION,
        parseToken,
        readTokenFromPptgoPages,
    } from "@/libs/pptgo-token";

    export let plugin;
    export let src;
    export let showCookieButton = false;

    onDestroy(() => {});

    let webviewEl: any;

    // 优先读当前 webview 的 localStorage，其次遍历其它 PPTGo 页面，
    // 最后兼容旧版把登录态写在 cookie 里的情况。
    const readToken = async (): Promise<string> => {
        try {
            if (webviewEl?.executeJavaScript) {
                const raw = await webviewEl.executeJavaScript(
                    "localStorage.getItem('BOSYUNCurrent')",
                    true,
                );
                const token = parseToken(raw);
                if (token) return token;
            }
        } catch (err) {
            console.warn("pptgo: read token from webview failed", err);
        }

        const liveToken = await readTokenFromPptgoPages();
        if (liveToken) return liveToken;

        try {
            const ses = (window as any)
                .require("@electron/remote")
                .session.fromPartition(PPTGO_PARTITION);
            const cookies = await ses.cookies.get({ url: PPTGO_ORIGIN });
            const item = cookies.find((c) => c.name == "BOSYUNCurrent");
            if (!item) return "";
            return parseToken(decodeURIComponent(item.value));
        } catch (err) {
            console.warn("pptgo: read token from cookie failed", err);
            return "";
        }
    };

    let getCookie = async () => {
        const access_token = await readToken();

        if (!access_token) {
            pushErrMsg("未获取到 access_token，请确认已在页签中完成 PPTGo 登录");
            return;
        }

        await plugin.saveData("PPTGO_CONFIG", {
            access_token: access_token,
        });
        store_logged_in.set(true);

        const refreshTree =
            plugin.myTree.$$.ctx[plugin.myTree.$$.props["refreshTree"]];
        await refreshTree();

        // 关闭登录页签
        plugin.loginTab?.then((tab) => {
            tab.close();
        });
    };
</script>

{#if true == showCookieButton}
<button class="cookie_button b3-button" on:click={getCookie}
>我确认我已经登录了</button
>
{/if}

<webview
    bind:this={webviewEl}
    allowfullscreen
    allowpopups
    style="border: none;width:100%;height:100%;"
    class="fn__flex-column fn__flex fn__flex-1"
    src={src}
    partition={PPTGO_PARTITION}
></webview>

<style>
    .cookie_button {
        position: absolute;
        z-index: 10;
    }
</style>
