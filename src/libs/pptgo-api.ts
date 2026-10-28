import { store_pptgo_header, openLoginFun } from "@/libs/store";
import { pushErrMsg } from "@/libs/api";

// PPTGo 前端使用的接口前缀：window.__global_env__.HTTP_API_BASE + "/api"
const API_BASE = "https://api.pptgo.cn/api";

let pptgo_header: Record<string, string> = {};
store_pptgo_header.subscribe((value) => (pptgo_header = value));

let openLogin: () => void = () => {};
openLoginFun.subscribe((fun) => (openLogin = fun));

type ApiResult = { ok: boolean; data: any };

async function request(path: string, init: RequestInit = {}) {
    const headers: Record<string, string> = {
        ...pptgo_header,
        ...((init.headers as Record<string, string>) || {}),
    };
    if (typeof init.body === "string" && !headers["content-type"]) {
        headers["content-type"] = "application/json";
    }
    return await fetch(API_BASE + path, { ...init, headers });
}

/** 接口统一返回 { code, msg, data }，这里只取 data；直接返回数组/对象的接口原样返回 */
function unwrap(res: any) {
    if (
        res &&
        typeof res === "object" &&
        !Array.isArray(res) &&
        Object.prototype.hasOwnProperty.call(res, "data") &&
        (res.code !== undefined || res.msg !== undefined)
    ) {
        return res.data;
    }
    return res;
}

/**
 * 解析响应。
 * 注意：删除、重命名等写操作成功时 data 可能为 null，
 * 因此成功与否看 code，而不是 data 是否存在。
 */
async function parse(resp: Response, notify = false): Promise<ApiResult> {
    let res: any = null;
    try {
        res = await resp.json();
    } catch (err) {
        console.error("[pptgo] response is not json", resp.status);
        return { ok: false, data: null };
    }

    if (resp.status === 401 || res?.code === 401) {
        await checkValid(res);
        return { ok: false, data: null };
    }

    if (
        res &&
        typeof res === "object" &&
        res.code !== undefined &&
        res.code !== 0
    ) {
        console.error("[pptgo]", res.code, res.msg || res.message || res);
        if (notify) {
            await pushErrMsg(res.msg || res.message || "PPTGo 操作失败");
        }
        return { ok: false, data: null };
    }

    return { ok: true, data: unwrap(res) };
}

async function checkValid(resp) {
    if (resp?.code == 401) {
        await pushErrMsg(
            (resp.msg || "登录已失效") +
                "\n请点击侧栏的登录图标，重新登录 PPTGo",
        );
        await openLogin();
    }
}

function asList(data: any): any[] {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.list)) return data.list;
    return [];
}

/**
 * 个人空间信息：{ team_id, project_id }
 * www 部署下 /web/space 不可用，改为取团队列表中的个人团队（type=1），
 * 再调用 /web/personal/v1/space 获取默认项目。
 */
export async function getSpaceConfig(teams?: any[]) {
    const teamList = teams || (await getTeams());
    const personal =
        teamList.find((item) => item && item.type === 1) || teamList[0];
    if (!personal) return null;

    const resp = await request(
        `/web/personal/v1/space?team_id=${personal.id}`,
        { method: "GET" },
    );
    const res = await parse(resp);
    if (res.ok && res.data && res.data.project_id) {
        return {
            team_id: res.data.team_id ?? personal.id,
            project_id: res.data.project_id,
        };
    }

    // 兜底：取该团队下的第一个项目
    const projects = await getProjects(personal.id);
    if (projects.length > 0) {
        return { team_id: personal.id, project_id: projects[0].id };
    }
    return null;
}

/** 团队列表：{ list: [...] } */
export async function getTeams(): Promise<any[]> {
    const resp = await request("/web/team/v1/teams", { method: "GET" });
    const res = await parse(resp);
    return asList(res.data);
}

/** 团队下的项目列表：{ list: [...] } */
export async function getProjects(team_id): Promise<any[]> {
    const resp = await request(`/web/team/v1/team/${team_id}/projects`, {
        method: "GET",
    });
    const res = await parse(resp);
    return asList(res.data);
}

/** 项目详情，用于获取个人空间默认项目的名称 */
export async function getProjectInfo(team_id, project_id) {
    const resp = await request(
        `/web/team/v1/team/${team_id}/project/${project_id}/info`,
        { method: "GET" },
    );
    const res = await parse(resp);
    return res.ok ? res.data : null;
}

/** 文件夹列表（folder_id 为 0 表示项目根目录） */
export async function getFolder(
    team_id,
    project_id,
    folder_id = 0,
): Promise<any[]> {
    const resp = await request(
        `/web/team/${team_id}/project/${project_id}/folder/${folder_id}/list`,
        { method: "GET" },
    );
    const res = await parse(resp);
    return asList(res.data);
}

/** 文件列表（folder_id 为 0 表示项目根目录） */
export async function getFiles(
    team_id,
    project_id,
    folder_id = 0,
): Promise<any[]> {
    // v1 的 files 路由在当前网关已下线，v2 需要分页参数
    const resp = await request(
        `/web/team/v2/team/${team_id}/project/${project_id}/files` +
            `?folder_id=${folder_id}&page_no=1&page_size=200`,
        { method: "GET" },
    );
    const res = await parse(resp);
    return asList(res.data);
}

/** 新建文件夹 */
export async function createFolder(param, name: string) {
    let { nodeId, project_id, team_id, type } = param;
    let folder_id = 0;
    if (type === "folder") {
        folder_id = nodeId;
    } else if (type === "project") {
        project_id = nodeId;
    }
    const resp = await request(
        `/web/team/${team_id}/project/${project_id}/folder`,
        {
            method: "POST",
            body: JSON.stringify({ name, pid: folder_id }),
        },
    );
    const res = await parse(resp, true);
    return res.ok ? res.data : null;
}

/** 新建演示文稿 */
export async function createFile(param, name: string) {
    let { nodeId, project_id, team_id, type } = param;
    let folder_id = 0;
    if (type === "folder") {
        folder_id = nodeId;
    } else if (type === "project") {
        project_id = nodeId;
    }
    const resp = await request(
        `/web/team/${team_id}/project/${project_id}/file`,
        {
            method: "POST",
            body: JSON.stringify({ name, folder_id }),
        },
    );
    const res = await parse(resp, true);
    return res.ok ? res.data : null;
}

/** 重命名文件 / 文件夹 / 项目 */
export async function rename(param, name: string): Promise<boolean> {
    let { nodeId, project_id, team_id, type } = param;
    let url = "";
    let method = "POST";

    if (type === "file") {
        url = `/web/file/${nodeId}/name`;
    } else if (type === "folder") {
        url = `/web/team/${team_id}/project/${project_id}/folder/${nodeId}/rename`;
    } else if (type === "project") {
        url = `/web/team/v1/team/${team_id}/project/${nodeId}/name`;
        method = "PUT";
    }

    if (!url) return false;

    const resp = await request(url, {
        method,
        body: JSON.stringify({ name }),
    });
    const res = await parse(resp, true);
    return res.ok;
}

/** 删除（移到回收站） */
export async function trash(param): Promise<boolean> {
    let { nodeId, project_id, team_id, type } = param;
    let url = "";
    if (type === "file") {
        url = `/web/file/${nodeId}/trash`;
    } else if (type === "folder") {
        url = `/web/team/${team_id}/project/${project_id}/folder/${nodeId}/trash`;
    } else if (type === "project") {
        url = `/web/team/v1/team/${team_id}/project/${nodeId}/trash`;
    }

    if (!url) return false;

    const resp = await request(url, { method: "POST" });
    const res = await parse(resp, true);
    return res.ok;
}

/** 移动文件 / 文件夹到目标项目或文件夹 */
export async function move(targetNode, moveNode): Promise<boolean> {
    let team_id = moveNode.team_id || targetNode.team_id;
    let project_id = moveNode.project_id;
    let folder_id = 0;

    if (moveNode.type === "project") {
        project_id = moveNode.nodeId;
    } else if (moveNode.type === "folder") {
        project_id = moveNode.project_id;
        folder_id = moveNode.nodeId;
    }

    let url = "";
    let body: any = {};

    if (targetNode.type === "file") {
        url = `/web/file/${targetNode.nodeId}/move`;
        body = { team_id, project_id, folder_id };
    } else if (targetNode.type === "folder") {
        url = `/web/team/${targetNode.team_id}/project/${targetNode.project_id}/folder/${targetNode.nodeId}/move`;
        body = {
            to_project_id: project_id,
            to_pid: folder_id,
            to_pre_folder_id: 0,
            to_next_folder_id: 0,
        };
    } else {
        return false;
    }

    const resp = await request(url, {
        method: "POST",
        body: JSON.stringify(body),
    });
    const res = await parse(resp, true);
    return res.ok;
}
