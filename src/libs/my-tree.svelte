<script lang="ts">
    import { Tree } from "siyuan-kit-svelte";
    import { onDestroy, onMount } from "svelte";
    import { Menu, Dialog, confirm } from "siyuan";
    import ConfirmInput from "@/libs/confirm-input.svelte";
    import MoveTree from "@/libs/move-tree.svelte";
    import {
        store_pptgo_header,
        store_logged_in,
        openLoginFun,
    } from "@/libs/store";
    import {
        createFolder,
        createFile,
        rename,
        getFolder,
        getTeams,
        getProjects,
        getProjectInfo,
        getFiles,
        getSpaceConfig,
        trash,
        move,
    } from "@/libs/pptgo-api";
    import {
        PPTGO_EDITOR_BASE,
        PPTGO_LOGIN_URL,
        clearPptgoLoginState,
        readTokenFromPptgoPages,
    } from "@/libs/pptgo-token";
    import { pushErrMsg, copy } from "@/libs/api";

    export let plugin;
    export let treeNodes;
    export let refreshTree;

    const TAB_TYPE = "pptgo_tab";
    const PLUGIN_NAME = "plugin-pptgo";
    let treeNodeMap = {};

    let vir_node = {
        type: "vir_node",
        name: "加载中...",
        nodeId: "vir_node",
        icon: "iconFile",
    };

    onMount(async () => {
        refreshTree();
    });

    onDestroy(() => {});

    const editorUrl = (fileKey) => PPTGO_EDITOR_BASE + fileKey;

    let nodeClick = async (node) => {
        if (!node) return;

        // 文件：点击直接在页签中打开（openPptgoTab 内部会去重）
        if (node.type === "file") {
            plugin.openPptgoTab({
                tabType: node.nodeId,
                name: node.name,
                url: editorUrl(node.nodeId),
                showCookieButton: false,
            });
            return;
        }

        // 文件夹/项目/团队：点击名称展开或收起
        if (
            node.type === "folder" ||
            node.type === "project" ||
            node.type === "team"
        ) {
            const id = node.nodeId;
            if (expandedIds.includes(id)) {
                expandedIds = expandedIds.filter((v) => v !== id);
            } else {
                expandedIds = [...expandedIds, id];
                const target = treeNodeMap[id];
                const hasVirtualNode =
                    target &&
                    target.children &&
                    target.children.some((item) => item.type === "vir_node");
                if (hasVirtualNode) {
                    await updateChildren(target);
                }
            }
            oldExpandedIds = expandedIds.slice(0);
        }
    };

    // Tree 组件内部的递归子节点不会把 nodeClick 事件透传出来，
    // 所以这里在容器上做事件委托，统一处理所有层级节点名称的单击。
    const onTreeClick = (e: MouseEvent) => {
        const target = e.target as HTMLElement | null;
        if (!target || !target.closest) return;
        // 只处理名称区域的单击，箭头和更多按钮保持原有行为
        if (!target.closest(".b3-list-item__text")) return;
        const li = target.closest("li[data-node-id]") as HTMLElement | null;
        if (!li || !li.dataset.nodeId) return;
        const node = treeNodeMap[li.dataset.nodeId];
        if (!node) return;
        nodeClick(node);
    };

    // 更多菜单
    let moreClick = (targetNode, e) => {
        let type = targetNode.type;
        let url = editorUrl(targetNode.nodeId);
        let name = targetNode.name;
        const menu = new Menu("pptgo-menu", () => {});

        if (type === "file") {
            menu.addItem({
                icon: "",
                label: "用tab打开",
                click: () => {
                    plugin.openPptgoTab({
                        tabType: targetNode.nodeId,
                        name: name,
                        url: url,
                        showCookieButton: false,
                    });
                },
            });
            menu.addItem({
                icon: "",
                label: "在浏览器打开",
                click: () => {
                    globalThis.open(url);
                },
            });
            menu.addItem({
                icon: "",
                label: "复制插件链接",
                click: () => {
                    let pluginUrl = `[${name}](siyuan://plugins/${PLUGIN_NAME}?name=${encodeURIComponent(name)}&id=${targetNode.nodeId})`;
                    copy(pluginUrl);
                },
            });
            menu.addItem({
                icon: "",
                label: "复制在线链接",
                click: () => {
                    copy(url);
                },
            });
        } else if (type === "folder" || type === "project" || type === "team") {
            if (type === "folder" || type === "project") {
                menu.addItem({
                    icon: "",
                    label: "新建演示文稿",
                    click: () => {
                        const di = new Dialog({
                            title: "新建演示文稿",
                            content: `<div class="b3-dialog__content"><div id="new-pptgo-file"></div></div>`,
                            width: "520px",
                        });

                        let ci = new ConfirmInput({
                            target: document.querySelector("#new-pptgo-file"),
                            props: {
                                confirmCall: async (value) => {
                                    if (value) {
                                        let fileRes = await createFile(
                                            targetNode,
                                            value,
                                        );
                                        if (fileRes && fileRes.file_key) {
                                            fileRes = {
                                                type: "file",
                                                name: fileRes.name,
                                                team_id: fileRes.team_id,
                                                project_id: fileRes.project_id,
                                                folder_id: fileRes.folder_id,
                                                nodeId: fileRes.file_key,
                                                icon: "iconFile",
                                            };
                                            await updateTreeNodes("new", {
                                                targetNode: targetNode,
                                                newNode: fileRes,
                                            });

                                            plugin.openPptgoTab({
                                                tabType: fileRes.nodeId,
                                                name: fileRes.name,
                                                url: editorUrl(fileRes.nodeId),
                                                showCookieButton: false,
                                            });
                                        }

                                        di.destroy();
                                        ci.$destroy();
                                    } else {
                                        pushErrMsg("必须填写内容");
                                    }
                                },
                            },
                        });
                    },
                });
                menu.addItem({
                    icon: "",
                    label: "新建文件夹",
                    click: () => {
                        const di = new Dialog({
                            title: "新建文件夹",
                            content: `<div class="b3-dialog__content"><div id="new-pptgo-folder"></div></div>`,
                            width: "520px",
                        });

                        let ci = new ConfirmInput({
                            target: document.querySelector(
                                "#new-pptgo-folder",
                            ),
                            props: {
                                confirmCall: async (value) => {
                                    if (value) {
                                        let folderRes = await createFolder(
                                            targetNode,
                                            value,
                                        );
                                        if (folderRes && folderRes.id) {
                                            folderRes = {
                                                type: "folder",
                                                name: folderRes.name,
                                                team_id: folderRes.team_id,
                                                project_id:
                                                    folderRes.project_id,
                                                nodeId: folderRes.id,
                                                icon: "iconFolder",
                                            };
                                            await updateTreeNodes("new", {
                                                targetNode: targetNode,
                                                newNode: folderRes,
                                            });
                                        }

                                        di.destroy();
                                        ci.$destroy();
                                    } else {
                                        pushErrMsg("必须填写内容");
                                    }
                                },
                            },
                        });
                    },
                });
            }
            menu.addItem({
                icon: "",
                label: "刷新子节点",
                click: async () => {
                    await updateChildren(targetNode);
                    expandedIds = expandedIds.filter(
                        (id) => id != targetNode.nodeId,
                    );
                    oldExpandedIds = expandedIds;
                },
            });
        }

        if (new Set(["folder", "file", "project"]).has(type)) {
            if (!targetNode.isDefaultProject) {
                //个人空间的默认项目不能删 ， 也不能重命名
                menu.addItem({
                    icon: "",
                    label: "删除",
                    click: async () => {
                        let parentNode = treeNodeMap[targetNode.parent_nodeId];
                        let ok = await trash(targetNode);
                        if (ok && parentNode) {
                            //刷新父级节点
                            await updateChildren(parentNode);
                        }
                    },
                });

                menu.addItem({
                    icon: "",
                    label: "重命名",
                    click: () => {
                        const di = new Dialog({
                            title: "重命名",
                            content: `<div class="b3-dialog__content"><div id="rename-pptgo"></div></div>`,
                            width: "520px",
                        });

                        let ci = new ConfirmInput({
                            target: document.querySelector("#rename-pptgo"),
                            props: {
                                name: targetNode.name,
                                confirmCall: async (value) => {
                                    if (value) {
                                        let ok = await rename(
                                            targetNode,
                                            value,
                                        );
                                        if (ok) {
                                            updateTreeNodes("rename", {
                                                targetNode: targetNode,
                                                newName: value,
                                            });
                                        }

                                        di.destroy();
                                        ci.$destroy();
                                    } else {
                                        pushErrMsg("必须填写内容");
                                    }
                                },
                            },
                        });
                    },
                });

                if (new Set(["folder", "file"]).has(type)) {
                    // 移动：只有文件或文件夹才能移动
                    menu.addItem({
                        icon: "",
                        label: "移动",
                        click: () => {
                            const di = new Dialog({
                                title: "移动",
                                content: `<div class="b3-dialog__content"><div id="move-tree"></div></div>`,
                                width: "520px",
                                height: "600px",
                            });

                            let ci = new MoveTree({
                                target: document.querySelector("#move-tree"),
                                props: {
                                    callMove: async (moveNode) => {
                                        if (
                                            moveNode.nodeId ===
                                            targetNode.nodeId
                                        ) {
                                            pushErrMsg("不能选当前节点");
                                            return;
                                        }
                                        if (
                                            moveNode.nodeId ===
                                            targetNode.parent_nodeId
                                        ) {
                                            pushErrMsg(
                                                "已经在该节点下, 无需移动 ",
                                            );
                                            return;
                                        }

                                        let moveSuccess = await move(
                                            targetNode,
                                            moveNode,
                                        );
                                        if (moveSuccess) {
                                            updateTreeNodes("move", {
                                                targetNode: targetNode,
                                                moveNode: moveNode,
                                            });
                                            di.destroy();
                                            ci.$destroy();
                                        } else {
                                            pushErrMsg(
                                                "移动失败，检查控制台网络请求",
                                            );
                                        }
                                    },
                                    srcNode: targetNode,
                                },
                            });
                        },
                    });
                }
            }
        }

        menu.open({
            x: e.clientX,
            y: e.clientY,
            isLeft: true,
        });
        e.stopPropagation();
    };

    /**
     * 读取登录态并生成请求头。
     * 已打开的 PPTGo 页面会持续刷新 token，优先使用页面里的最新值。
     */
    async function genPptgoHeader() {
        let PPTGO_CONFIG = await plugin.loadData("PPTGO_CONFIG");
        let stored_token = PPTGO_CONFIG
            ? PPTGO_CONFIG["access_token"] || ""
            : "";

        let live_token = await readTokenFromPptgoPages();
        if (live_token && live_token !== stored_token) {
            await plugin.saveData("PPTGO_CONFIG", {
                access_token: live_token,
            });
        }

        let access_token = live_token || stored_token;
        store_logged_in.set(!!access_token);

        store_pptgo_header.set({
            accept: "application/json, text/plain, */*",
            "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
            authorization: "Bearer " + access_token,
            "x-lang": "zh-CN",
        });
        return access_token;
    }

    refreshTree = async () => {
        //关闭所有展开的节点
        expandedIds = [];
        oldExpandedIds = [];
        let access_token = await genPptgoHeader();
        // 未登录时不请求接口，避免一串 401
        if (!access_token) {
            treeNodes = [];
            return;
        }

        // 团队列表既用于个人空间定位，也用于展示其它团队
        let teamRes = await getTeams();
        let spaceRes = await getSpaceConfig(teamRes);
        let team_id = spaceRes?.team_id ?? 0;
        let project_id = spaceRes?.project_id ?? 0;

        const roots: any[] = [];

        // 个人空间：一个团队 + 一个默认项目
        if (team_id && project_id) {
            let projectInfo = await getProjectInfo(team_id, project_id);
            roots.push({
                type: "team",
                name: "个人空间",
                nodeId: team_id,
                team_id: team_id,
                icon: "iconFolder",
                children: [
                    {
                        type: "project",
                        isDefaultProject: true,
                        name: projectInfo?.name || "我的项目",
                        nodeId: project_id,
                        team_id: team_id,
                        project_id: project_id,
                        icon: "iconFolder",
                        children: [Object.assign({}, vir_node)],
                    },
                ],
            });
        }

        // 其它团队：展开后再加载项目
        teamRes.forEach((item) => {
            if (!item || item.id == null) return;
            // 个人空间已经单独展示
            if (String(item.id) === String(team_id)) return;
            if (item.type !== undefined && item.type !== 2) return;
            roots.push({
                type: "team",
                name: item.name,
                nodeId: item.id,
                icon: "iconFolder",
                children: [Object.assign({}, vir_node)],
            });
        });

        await updateTreeNodes("equals", { nodes: roots });
    };

    let expandedChange = async (e) => {
        // 与 Tree 内部展开状态保持同步，供名称点击切换展开/收起
        expandedIds = e.detail;
        let { toggleNodeId, isExpanded } = getCurrToggle(e.detail);
        let toggleNode = treeNodeMap[toggleNodeId];
        if (!toggleNode) return;
        let hasVirtualNode =
            toggleNode.children &&
            toggleNode.children.some((item) => item.type === "vir_node");
        if (isExpanded && hasVirtualNode) {
            await updateChildren(toggleNode);
        }
    };

    //更新子节点
    async function updateChildren(targetNode) {
        let type = targetNode.type;
        let children = [];
        if (type === "folder" || type === "project") {
            let folder_id, project_id, team_id;
            if (type === "project") {
                folder_id = 0;
                project_id = targetNode.nodeId;
            } else {
                folder_id = targetNode.nodeId;
                project_id = targetNode.project_id;
            }
            team_id = targetNode.team_id;

            //获取文件夹
            let folderRes = await getFolder(team_id, project_id, folder_id);
            children = folderRes.map((item) => {
                let node: any = {
                    type: "folder",
                    name: item.name,
                    team_id: item.team_id ?? team_id,
                    project_id: item.project_id ?? project_id,
                    nodeId: item.id,
                    icon: "iconFolder",
                };
                if (item.file_count > 0 || item.folder_count > 0) {
                    node.children = [Object.assign({}, vir_node)];
                }
                return node;
            });

            //获取文件
            let filesRes = await getFiles(team_id, project_id, folder_id);
            let files = filesRes.map((item) => {
                let node: any = {
                    type: "file",
                    name: item.name,
                    team_id: item.team_id ?? team_id,
                    project_id: item.project_id ?? project_id,
                    folder_id: item.folder_id ?? folder_id,
                    nodeId: item.file_key,
                    icon: "iconFile",
                };
                return node;
            });

            children = children.concat(files);
        } else if (type === "team") {
            // 获取团队项目
            let projectsRes = await getProjects(targetNode.nodeId);
            children = projectsRes.map((item) => {
                let node: any = {
                    type: "project",
                    name: item.name,
                    nodeId: item.id,
                    team_id: item.team_id ?? targetNode.nodeId,
                    project_id: item.id,
                    icon: "iconFolder",
                    children: [Object.assign({}, vir_node)],
                };
                return node;
            });
        }

        await updateTreeNodes("update_children", {
            children: children,
            targetNode: targetNode,
        });
    }
    /**
     * 获取当前正在操作的节点
     */
    function getCurrToggle(newExpandedIds) {
        //新旧最多，相差一个
        let isExpanded = newExpandedIds.length > oldExpandedIds.length;
        let complement = newExpandedIds
            .filter((v) => !oldExpandedIds.includes(v))
            .concat(oldExpandedIds.filter((v) => !newExpandedIds.includes(v)));
        let toggleNodeId = complement[0];
        oldExpandedIds = newExpandedIds.slice(0);
        return { toggleNodeId: toggleNodeId, isExpanded: isExpanded };
    }

    /**
     * 更新TreeNodes , 同时更新treeNodeMap
     */
    async function updateTreeNodes(type, data) {
        // 全等， 新建，获取children， 重命名，删除，移动
        if (type === "equals") {
            treeNodes = data.nodes;
            treeNodeMap = {};
            updateTreeNodeMap(data.nodes);
        } else if (type === "new") {
            let targetNode = data.targetNode;
            let children = [...(targetNode.children || []), data.newNode];
            targetNode.children = children;
            //更新treeNodes
            treeNodes = treeNodes;
            //更新map
            updateTreeNodeMap(children, targetNode.nodeId);
        } else if (type === "update_children") {
            let children = data.children;
            let tree_path_arr = data.targetNode.tree_path_arr || [];
            let targetNode = tree_path_arr.reduce((tempTreeNodes, targetId) => {
                if (!Array.isArray(tempTreeNodes)) {
                    tempTreeNodes = tempTreeNodes.children;
                }
                return tempTreeNodes.find((item) => item.nodeId == targetId);
            }, treeNodes);
            if (!targetNode) {
                targetNode = data.targetNode;
            }
            targetNode.children = children;
            //更新treeNodes
            treeNodes = treeNodes;
            //更新map
            updateTreeNodeMap(children, targetNode.nodeId);
        } else if (type === "move") {
            let targetNode = data.targetNode;
            let moveNode = treeNodeMap[data.moveNode.nodeId];
            if (moveNode) {
                let targetParentNode = treeNodeMap[targetNode.parent_nodeId];
                let targetChildren = (targetParentNode.children || []).filter(
                    (node) => {
                        return node.nodeId !== targetNode.nodeId;
                    },
                );
                let moveChildren = [...(moveNode.children || []), targetNode];

                // 刷新原父节点
                await updateTreeNodes("update_children", {
                    children: targetChildren,
                    targetNode: targetParentNode,
                });

                // 刷新新父节点
                await updateTreeNodes("update_children", {
                    children: moveChildren,
                    targetNode: moveNode,
                });
            } else {
                //可能有的节点没展开还没存入treeNodeMap
                refreshTree();
            }
        } else if (type === "rename") {
            let targetNode = data.targetNode;
            targetNode.name = data.newName;
            treeNodes = treeNodes;
            treeNodeMap[targetNode.nodeId] = targetNode;
        }
    }

    /**
     * id 和 treeNode 的映射 ，在每一次 treeNodes 更新的时候调用
     */
    function updateTreeNodeMap(nodes = [], parent_nodeId = "") {
        nodes.forEach((node) => {
            treeNodeMap[node.nodeId] = node;
            node["parent_nodeId"] = parent_nodeId;
            if (parent_nodeId.toString().length > 0) {
                let parentTreePathArr =
                    treeNodeMap[parent_nodeId]?.["tree_path_arr"] || [
                        parent_nodeId,
                    ];
                node["tree_path_arr"] = [...parentTreePathArr, node.nodeId];
            } else {
                node["tree_path_arr"] = [node.nodeId];
            }

            if (node.children && node.children.length > 0) {
                updateTreeNodeMap(node.children, node.nodeId);
            }
        });
    }

    let expandedIds = [];
    let oldExpandedIds = [];
    let actions = [
        { type: "more", icon: "iconMore", title: "more", callback: moreClick },
    ];

    let openLogin;

    openLoginFun.set(() => {
        plugin.loginTab = plugin.openPptgoTab({
            tabType: TAB_TYPE,
            name: "登录 PPTGo",
            url: PPTGO_LOGIN_URL,
            showCookieButton: true,
        });
    });

    openLoginFun.subscribe((fun) => (openLogin = fun));

    // 登录状态：用于切换 dock 上的登录/登出图标
    let loggedIn = false;
    store_logged_in.subscribe((value) => (loggedIn = value));

    const onLoginClick = () => {
        if (!loggedIn) {
            openLogin();
            return;
        }

        confirm(
            "退出登录",
            "退出后将清除本机保存的 PPTGo 登录信息，需要重新登录才能使用目录树。确定退出吗？",
            async () => {
                await plugin.removeData("PPTGO_CONFIG");
                await clearPptgoLoginState();

                store_pptgo_header.set({});
                store_logged_in.set(false);
                treeNodes = [];
                expandedIds = [];
                oldExpandedIds = [];
                pushErrMsg("已退出 PPTGo 登录");
            },
        );
    };
</script>

<div class="fn__flex-1 fn__flex-column testDocks">
    <div class="block__icons">
        <div class="block__logo" title="PPTGo · 文件目录树">
            <svg class="block__logoicon">
                <use xlink:href="#pptgo_logo"></use>
            </svg>
            <span class="pptgo-dock-title">PPTGo</span>
        </div>
        <span class="fn__flex-1 fn__space" />
        <div class="pptgo-dock-actions">
            <span
                class="block__icon b3-tooltips b3-tooltips__sw"
                role="button"
                tabindex="0"
                aria-label="刷新目录树"
                on:click={refreshTree}
                on:keydown={(e) => e.key === "Enter" && refreshTree()}
            >
                <svg><use xlink:href="#pptgo_refresh"></use></svg>
            </span>
            <span
                class="block__icon b3-tooltips b3-tooltips__sw"
                role="button"
                tabindex="0"
                aria-label={loggedIn ? "退出 PPTGo 登录" : "登录 PPTGo"}
                on:click={onLoginClick}
                on:keydown={(e) => e.key === "Enter" && onLoginClick()}
            >
                <svg>
                    <use
                        xlink:href={loggedIn
                            ? "#pptgo_logout"
                            : "#pptgo_login"}
                    ></use>
                </svg>
            </span>
        </div>
    </div>
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div class="fn__flex-1 pptgo-tree" on:click={onTreeClick}>
        <Tree
            {treeNodes}
            {actions}
            {expandedIds}
            on:expandedChange={expandedChange}
        />
    </div>
</div>
<style>
    /* 标题和两个操作按钮保持同一行，按钮始终可见 */
    .block__icons {
        display: flex;
        flex-wrap: nowrap;
        align-items: center;
    }

    .block__logo {
        display: flex;
        align-items: center;
        min-width: 0;
        margin-right: 0;
        flex: 0 1 auto;
        overflow: hidden;
    }

    .block__logoicon {
        flex: 0 0 auto;
    }

    .pptgo-dock-title {
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
    }

    .pptgo-dock-actions {
        display: flex;
        flex-direction: row;
        flex-wrap: nowrap;
        align-items: center;
        gap: 2px;
        flex: 0 0 auto;
        margin-left: 4px;
    }

    .pptgo-dock-actions .block__icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        margin-left: 0;
        padding: 0;
        cursor: pointer;
        opacity: 1 !important;
        visibility: visible !important;
    }

    .pptgo-dock-actions .block__icon:hover {
        background-color: var(--b3-list-hover, rgba(0, 0, 0, 0.06));
        border-radius: var(--b3-border-radius, 4px);
    }

    .pptgo-dock-actions .block__icon svg {
        width: 14px;
        height: 14px;
    }

    .pptgo-tree {
        flex: 1 1 auto;
        min-height: 0;
        overflow: auto;
    }
</style>
