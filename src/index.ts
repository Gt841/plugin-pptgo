import { Plugin, openTab, type ITab } from "siyuan";
import "@/index.scss";
import MyTree from "@/libs/my-tree.svelte";
import PptgoWebview from "@/libs/pptgo-webview.svelte";
import { canParse } from "@/libs/api";
import { PPTGO_EDITOR_BASE } from "@/libs/pptgo-token";

const DOCK_TYPE = "dock_tab";

export default class PptgoPlugin extends Plugin {
    private openSiyuanUrlPluginEventBindThis =
        this.openSiyuanUrlPluginEvent.bind(this);

    public myTree: any;
    public loginTab: any;
    // tabType -> 已打开的页签，用于去重
    public tabMap = new Map<string, Promise<ITab>>();
    // 已注册过的页签类型，避免重复 addTab
    private registeredTabs = new Set<string>();

    async onload() {
        this.addIcons(`<symbol id="pptgo_logo" viewBox="0 0 24 24">
<path d="M21 3H3c-1.1 0-2 .9-2 2v11c0 1.1.9 2 2 2h7v2H7v2h10v-2h-3v-2h7c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 13H3V5h18v11z"></path>
<path d="M10 8.5v6l5-3z"></path>
</symbol>
<symbol id="pptgo_refresh" viewBox="0 0 24 24">
<path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"></path>
</symbol>
<symbol id="pptgo_login" viewBox="0 0 24 24">
<path d="M11 7L9.6 8.4l2.6 2.6H2v2h10.2l-2.6 2.6L11 17l5-5-5-5zm9 12h-8v2h8c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-8v2h8v14z"></path>
</symbol>
<symbol id="pptgo_logout" viewBox="0 0 24 24">
<path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5-5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"></path>
</symbol>
`);

        this.addDock({
            config: {
                position: "LeftBottom",
                size: { width: 200, height: 0 },
                icon: "pptgo_logo",
                title: "PPTGo",
            },
            data: {
                text: "PPTGo",
            },
            type: DOCK_TYPE,
            resize() {
                console.log(DOCK_TYPE + " resize");
            },
            update() {
                console.log(DOCK_TYPE + " update");
            },
            init: (dock) => {
                this.myTree = new MyTree({
                    target: dock.element,
                    props: {
                        app: this.app,
                        plugin: this,
                        treeNodes: [],
                    },
                });
            },
            destroy() {
                console.log("destroy dock:", DOCK_TYPE);
            },
        });

        this.eventBus.on(
            "open-siyuan-url-plugin",
            this.openSiyuanUrlPluginEventBindThis,
        );
    }

    onLayoutReady() {}

    async onunload() {}

    uninstall() {
        console.log("uninstall");
    }

    openSiyuanUrlPluginEvent({ detail }: any) {
        const searchParams = new URL(detail.url).searchParams;
        const pluginParams = [...searchParams.entries()].reduce((a, c) => {
            a[c[0]] = canParse(c[1]) ? JSON.parse(c[1]) : c[1];
            return a;
        }, {});
        this.openPptgoTab({
            tabType: pluginParams["id"],
            name: pluginParams["name"],
            url: PPTGO_EDITOR_BASE + pluginParams["id"],
            showCookieButton: false,
        });
    }

    openPptgoTab(param: {
        tabType: string;
        name: string;
        url: string;
        showCookieButton?: boolean;
    }): Promise<ITab> {
        const { tabType } = param;

        // 同一个文件只保留一个页签，重复点击时切换到已有页签
        const existing = this.tabMap.get(tabType);
        if (existing) {
            return existing.then((tab) => {
                if (tab?.headElement?.isConnected) {
                    tab.headElement.click();
                    return tab;
                }
                this.tabMap.delete(tabType);
                return this.createPptgoTab(param);
            });
        }

        const promise = this.createPptgoTab(param);
        this.tabMap.set(tabType, promise);
        promise.catch(() => this.tabMap.delete(tabType));
        return promise;
    }

    private createPptgoTab(param: {
        tabType: string;
        name: string;
        url: string;
        showCookieButton?: boolean;
    }): Promise<ITab> {
        const { tabType, name, url, showCookieButton = false } = param;

        if (!this.registeredTabs.has(tabType)) {
            this.registeredTabs.add(tabType);
            const plugin = this;
            this.addTab({
                type: tabType,
                init() {
                    const tabDiv = document.createElement("div");
                    tabDiv.setAttribute(
                        "style",
                        "width:100%;height:100%;position:relative;",
                    );
                    new PptgoWebview({
                        target: tabDiv,
                        props: {
                            plugin,
                            app: plugin.app,
                            this: plugin,
                            src: url,
                            showCookieButton,
                        },
                    });
                    this.element.appendChild(tabDiv);
                },
                beforeDestroy() {
                    console.log("before destroy tab:", tabType);
                },
                destroy() {
                    console.log("destroy tab:", tabType);
                    plugin.registeredTabs.delete(tabType);
                    plugin.tabMap.delete(tabType);
                },
            });
        }

        return openTab({
            app: this.app,
            custom: {
                // 页签上显示 PPTGo 图标，便于和思源文档页签区分
                icon: "pptgo_logo",
                title: name,
                data: {
                    text: name,
                },
                id: this.name + tabType,
            },
        });
    }
}
