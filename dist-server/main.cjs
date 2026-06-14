//#region \0rolldown/runtime.js
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") {
		for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
			key = keys[i];
			if (!__hasOwnProp.call(to, key) && key !== except) {
				__defProp(to, key, {
					get: ((k) => from[k]).bind(null, key),
					enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
				});
			}
		}
	}
	return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", {
	value: mod,
	enumerable: true
}) : target, mod));

//#endregion
let node_path = require("node:path");
node_path = __toESM(node_path);
let node_url = require("node:url");
let node_fs = require("node:fs");
node_fs = __toESM(node_fs);
let dotenv = require("dotenv");
dotenv = __toESM(dotenv);
let node_http = require("node:http");
node_http = __toESM(node_http);
let node_fs_promises = require("node:fs/promises");
node_fs_promises = __toESM(node_fs_promises);
let _composio_core = require("@composio/core");
let node_crypto = require("node:crypto");
let node_os = require("node:os");
node_os = __toESM(node_os);
let _libsql_client = require("@libsql/client");
let node_child_process = require("node:child_process");
let node_util = require("node:util");

//#region src/server/env.ts
const moduleDir$2 = typeof __dirname === "string" ? __dirname : node_path.default.dirname((0, node_url.fileURLToPath)(require("url").pathToFileURL(__filename).href));
/** Load .env files for the standalone web server (mirrors Electron main). */
function loadEnv() {
	const candidates = [
		node_path.default.join(process.cwd(), ".env.local"),
		node_path.default.join(process.cwd(), ".env"),
		node_path.default.join(moduleDir$2, "..", "..", ".env.local"),
		node_path.default.join(moduleDir$2, "..", "..", ".env")
	];
	for (const file of candidates) if (node_fs.default.existsSync(file)) {
		dotenv.config({ path: file });
		return;
	}
}

//#endregion
//#region src/main/progress.ts
const CHANNEL = "checklist:progress";
const listeners = /* @__PURE__ */ new Set();
function subscribeProgress(listener) {
	listeners.add(listener);
	return () => listeners.delete(listener);
}
/** Broadcast generation progress to SSE subscribers and Electron renderers. */
function emitProgress(payload) {
	for (const listener of listeners) try {
		listener(payload);
	} catch (err) {
		console.error("[progress] listener failed:", err);
	}
	if (process.versions.electron) try {
		const { BrowserWindow } = require("electron");
		for (const win of BrowserWindow.getAllWindows()) {
			if (win.isDestroyed()) continue;
			win.webContents.send(CHANNEL, payload);
		}
	} catch {}
}

//#endregion
//#region src/main/paths.ts
function resolvePaths(override) {
	const dataDir = override?.dataDir ?? defaultDataDir();
	return {
		dataDir,
		dbFile: node_path.default.join(dataDir, "komorebi.db")
	};
}
function defaultDataDir() {
	if (process.env.KOMOREBI_DATA_DIR) return process.env.KOMOREBI_DATA_DIR;
	if (process.versions.electron) try {
		const { app } = require("electron");
		if (app?.getPath) return node_path.default.join(app.getPath("userData"), "data");
	} catch {}
	if (process.platform === "darwin") return node_path.default.join(node_os.default.homedir(), "Library", "Application Support", "Komorebi", "data");
	return node_path.default.join(node_os.default.homedir(), ".komorebi");
}

//#endregion
//#region src/main/integrations/composio.ts
/**
* Lightweight wrapper around the Composio SDK so the rest of the app
* doesn't have to know the exact API shape. All methods accept a
* `userId` so multi-user is possible later — for now a single local
* user is created lazily and reused.
*/
let _client = null;
let _userId = null;
var ComposioConfigError = class extends Error {};
function getClient$2() {
	if (_client) return _client;
	const apiKey = process.env.COMPOSIO_API_KEY?.trim();
	if (!apiKey) throw new ComposioConfigError("COMPOSIO_API_KEY is not set. Add it to .env.local.");
	_client = new _composio_core.Composio({ apiKey });
	return _client;
}
function getUserId(override) {
	if (_userId) return _userId;
	const paths = resolvePaths(override);
	node_fs.default.mkdirSync(paths.dataDir, { recursive: true });
	const userIdFile = node_path.default.join(paths.dataDir, "user-id");
	if (node_fs.default.existsSync(userIdFile)) {
		const existing = node_fs.default.readFileSync(userIdFile, "utf8").trim();
		if (existing) {
			_userId = existing;
			return existing;
		}
	}
	const fresh = `user_${(0, node_crypto.randomUUID)()}`;
	node_fs.default.writeFileSync(userIdFile, fresh, "utf8");
	_userId = fresh;
	return fresh;
}
async function listToolkits$1() {
	const raw = await getClient$2().toolkits.get({});
	return (Array.isArray(raw) ? raw : raw.items ?? []).map((entry) => {
		const t = entry;
		const meta = t.meta ?? {};
		const categories = Array.isArray(meta.categories) ? meta.categories.map((c) => String(c.name ?? c.slug ?? "")) : [];
		return {
			slug: String(t.slug ?? ""),
			name: String(t.name ?? t.slug ?? ""),
			description: typeof meta.description === "string" ? meta.description : null,
			logo: typeof meta.logo === "string" ? meta.logo : null,
			categories: categories.filter(Boolean),
			authSchemes: Array.isArray(t.authSchemes) ? t.authSchemes : [],
			managedAuthSchemes: Array.isArray(t.composioManagedAuthSchemes) ? t.composioManagedAuthSchemes : [],
			isLocal: Boolean(t.isLocalToolkit ?? false),
			noAuth: Boolean(t.noAuth ?? false)
		};
	});
}
async function listConnections(userId) {
	return ((await getClient$2().connectedAccounts.list({ userIds: [userId] })).items ?? []).map((raw) => {
		const c = raw;
		const toolkit = c.toolkit ?? {};
		const authConfig = c.authConfig ?? c.auth_config ?? {};
		return {
			id: String(c.id ?? ""),
			toolkitSlug: String(toolkit.slug ?? c.toolkitSlug ?? c.toolkit_slug ?? ""),
			status: String(c.status ?? "UNKNOWN"),
			authConfigId: typeof authConfig.id === "string" ? authConfig.id : null,
			createdAt: typeof c.createdAt === "string" ? c.createdAt : typeof c.created_at === "string" ? c.created_at : null
		};
	});
}
/**
* Find or create a Composio-managed auth config for the given toolkit.
* Composio-managed = uses Composio's own OAuth credentials, so no developer
* setup needed per toolkit. Falls back gracefully if not all toolkits support
* managed auth.
*/
async function ensureManagedAuthConfig(toolkitSlug) {
	const client = getClient$2();
	const items = (await client.authConfigs.list({
		toolkit: toolkitSlug,
		isComposioManaged: true
	})).items ?? [];
	if (items.length > 0 && typeof items[0]?.id === "string") return items[0].id;
	const created = await client.authConfigs.create(toolkitSlug, { type: "use_composio_managed_auth" });
	const id = created.id ?? created.authConfigId;
	if (!id) throw new ComposioConfigError(`Could not create managed auth config for toolkit "${toolkitSlug}"`);
	return id;
}
async function startConnection(toolkitSlug, userId) {
	const client = getClient$2();
	const authConfigId = await ensureManagedAuthConfig(toolkitSlug);
	const request = await client.connectedAccounts.link(userId, authConfigId);
	return {
		connectionId: request.id,
		redirectUrl: request.redirectUrl ?? null
	};
}

//#endregion
//#region src/main/integrations/service.ts
/**
* High-level integrations service used by IPC handlers.
* Composes the Composio client + Electron shell.
*
* No local SQLite cache — Composio is authoritative for connection state,
* and the renderer caches the joined view via TanStack Query.
*/
let cachedToolkits = null;
let toolkitsCachedAt = 0;
const TOOLKIT_TTL_MS = 3600 * 1e3;
async function listToolkits(forceRefresh = false) {
	if (forceRefresh || !cachedToolkits || Date.now() - toolkitsCachedAt > TOOLKIT_TTL_MS) {
		cachedToolkits = await listToolkits$1();
		toolkitsCachedAt = Date.now();
	}
	return cachedToolkits;
}
async function getIntegrations() {
	const userId = getUserId();
	const [toolkits, connections] = await Promise.all([listToolkits(), listConnections(userId)]);
	const bySlug = new Map(connections.map((c) => [c.toolkitSlug, c]));
	return toolkits.map((t) => {
		const conn = bySlug.get(t.slug) ?? null;
		const supported = t.noAuth || t.managedAuthSchemes.length > 0;
		return {
			toolkit: t,
			status: conn ? "connected" : supported ? "available" : "unsupported",
			connection: conn
		};
	});
}
async function refreshConnections() {
	return listConnections(getUserId());
}
function openExternal(url) {
	if (!process.versions.electron) return;
	try {
		const { shell } = require("electron");
		shell.openExternal(url);
	} catch {}
}
async function beginConnect(toolkitSlug) {
	const result = await startConnection(toolkitSlug, getUserId());
	if (result.redirectUrl) openExternal(result.redirectUrl);
	return result;
}
/** Block until Composio reports the connection as active (or 3 min timeout). */
async function awaitConnect(toolkitSlug) {
	const userId = getUserId();
	const apiKey = process.env.COMPOSIO_API_KEY?.trim();
	if (!apiKey) throw new ComposioConfigError("COMPOSIO_API_KEY missing");
	const composio = new _composio_core.Composio({ apiKey });
	const authConfigId = await ensureManagedAuthConfig(toolkitSlug);
	const request = await composio.connectedAccounts.link(userId, authConfigId);
	if (request.redirectUrl) openExternal(request.redirectUrl);
	await request.waitForConnection(18e4);
	return (await listConnections(userId)).find((c) => c.toolkitSlug === toolkitSlug) ?? null;
}
async function disconnectIntegration(toolkitSlug) {
	const userId = getUserId();
	const apiKey = process.env.COMPOSIO_API_KEY?.trim();
	if (!apiKey) throw new ComposioConfigError("COMPOSIO_API_KEY missing");
	const composio = new _composio_core.Composio({ apiKey });
	const existing = (await listConnections(userId)).find((c) => c.toolkitSlug === toolkitSlug);
	if (!existing) return;
	try {
		await composio.connectedAccounts.delete(existing.id);
	} catch (err) {
		console.error(`[integrations] composio delete failed:`, err);
		throw err;
	}
}

//#endregion
//#region src/main/weather/service.ts
const CACHE_TTL_MS = 1800 * 1e3;
const cache$1 = /* @__PURE__ */ new Map();
function describeWmo(code) {
	if (code === 0) return {
		condition: "clear",
		description: "Clear sky"
	};
	if (code === 1) return {
		condition: "clear",
		description: "Mostly clear"
	};
	if (code === 2) return {
		condition: "clouds",
		description: "Partly cloudy"
	};
	if (code === 3) return {
		condition: "clouds",
		description: "Overcast"
	};
	if (code === 45 || code === 48) return {
		condition: "mist",
		description: "Foggy"
	};
	if (code >= 51 && code <= 57) return {
		condition: "drizzle",
		description: "Drizzle"
	};
	if (code >= 61 && code <= 67) return {
		condition: "rain",
		description: "Rain"
	};
	if (code >= 71 && code <= 77) return {
		condition: "snow",
		description: "Snow"
	};
	if (code >= 80 && code <= 82) return {
		condition: "rain",
		description: "Rain showers"
	};
	if (code === 85 || code === 86) return {
		condition: "snow",
		description: "Snow showers"
	};
	if (code >= 95 && code <= 99) return {
		condition: "thunderstorm",
		description: "Thunderstorm"
	};
	return {
		condition: "unknown",
		description: "Unknown"
	};
}
async function geocode(query) {
	const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
	url.searchParams.set("name", query);
	url.searchParams.set("count", "1");
	url.searchParams.set("language", "en");
	url.searchParams.set("format", "json");
	const res = await fetch(url);
	if (!res.ok) return null;
	const top = (await res.json()).results?.[0];
	if (!top) return null;
	return {
		lat: Number(top.latitude),
		lon: Number(top.longitude),
		name: String(top.name ?? query),
		country: typeof top.country_code === "string" ? top.country_code : null
	};
}
async function fetchForecast(lat, lon) {
	const url = new URL("https://api.open-meteo.com/v1/forecast");
	url.searchParams.set("latitude", String(lat));
	url.searchParams.set("longitude", String(lon));
	url.searchParams.set("current", "temperature_2m,weather_code,is_day");
	url.searchParams.set("daily", "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum");
	url.searchParams.set("timezone", "auto");
	url.searchParams.set("forecast_days", "1");
	const res = await fetch(url);
	if (!res.ok) return null;
	return await res.json();
}
async function getCurrentWeather(location) {
	const key = location.trim().toLowerCase();
	if (!key) return null;
	const cached = cache$1.get(key);
	if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;
	try {
		const place = await geocode(location);
		if (!place) {
			cache$1.set(key, {
				value: null,
				at: Date.now()
			});
			return null;
		}
		const forecast = await fetchForecast(place.lat, place.lon);
		const current = forecast?.current;
		const daily = forecast?.daily;
		if (!current || !daily) {
			cache$1.set(key, {
				value: null,
				at: Date.now()
			});
			return null;
		}
		const currentInfo = describeWmo(current.weather_code ?? -1);
		const dailyInfo = describeWmo(daily.weather_code?.[0] ?? -1);
		const summary = {
			condition: currentInfo.condition,
			description: currentInfo.description,
			temperatureC: Math.round(current.temperature_2m ?? 0),
			isNight: current.is_day === 0,
			resolvedName: place.country ? `${place.name}, ${place.country}` : place.name,
			daily: {
				condition: dailyInfo.condition,
				description: dailyInfo.description,
				tempMaxC: Math.round(daily.temperature_2m_max?.[0] ?? 0),
				tempMinC: Math.round(daily.temperature_2m_min?.[0] ?? 0),
				precipitationProbabilityPct: Math.round(daily.precipitation_probability_max?.[0] ?? 0),
				precipitationMm: Math.round((daily.precipitation_sum?.[0] ?? 0) * 10) / 10
			}
		};
		cache$1.set(key, {
			value: summary,
			at: Date.now()
		});
		return summary;
	} catch (err) {
		console.error("[weather] failed:", err);
		cache$1.set(key, {
			value: null,
			at: Date.now()
		});
		return null;
	}
}

//#endregion
//#region src/main/store/db.ts
let client = null;
let schemaPromise = null;
async function getDb() {
	if (client) return client;
	const url = process.env.TURSO_DB_URL;
	const authToken = process.env.TURSO_AUTH_TOKEN;
	if (!url || !authToken) return null;
	client = (0, _libsql_client.createClient)({
		url,
		authToken
	});
	if (!schemaPromise) schemaPromise = initSchema();
	await schemaPromise;
	return client;
}
async function initSchema() {
	const db = client;
	if (!db) return;
	await db.batch([
		`CREATE TABLE IF NOT EXISTS goals (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      context TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
		`CREATE TABLE IF NOT EXISTS suggestions (
      id TEXT PRIMARY KEY,
      goal_id TEXT NOT NULL,
      date TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      detail_markdown TEXT NOT NULL,
      resource_url TEXT,
      estimated_minutes INTEGER,
      status TEXT NOT NULL DEFAULT 'pending',
      rating TEXT,
      created_at TEXT NOT NULL,
      completed_at TEXT
    )`,
		`CREATE TABLE IF NOT EXISTS reflections (
      id TEXT PRIMARY KEY,
      suggestion_id TEXT NOT NULL,
      text TEXT NOT NULL,
      rating TEXT,
      created_at TEXT NOT NULL
    )`,
		`CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY DEFAULT 1,
      data TEXT NOT NULL
    )`
	]);
	await db.execute({
		sql: `INSERT OR IGNORE INTO settings (id, data) VALUES (1, ?)`,
		args: [JSON.stringify({
			schedule: {
				enabled: true,
				time: "07:00",
				lastRunDate: null
			},
			theme: "system"
		})]
	});
}

//#endregion
//#region src/main/store/file-store.ts
function makeStore(filename, defaultValue) {
	let cache = null;
	let inflight = Promise.resolve();
	async function readFromDisk() {
		const { dataDir } = resolvePaths();
		const file = node_path.default.join(dataDir, filename);
		try {
			const raw = await node_fs_promises.default.readFile(file, "utf8");
			return JSON.parse(raw);
		} catch (err) {
			if (err.code === "ENOENT") return defaultValue();
			throw err;
		}
	}
	async function writeToDisk(data) {
		const { dataDir } = resolvePaths();
		await node_fs_promises.default.mkdir(dataDir, { recursive: true });
		const file = node_path.default.join(dataDir, filename);
		const tmp = `${file}.${process.pid}.tmp`;
		await node_fs_promises.default.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
		await node_fs_promises.default.rename(tmp, file);
	}
	return {
		async load() {
			if (cache !== null) return cache;
			cache = await readFromDisk();
			return cache;
		},
		async save(data) {
			await writeToDisk(data);
			cache = data;
		},
		async mutate(fn) {
			const next = inflight.then(async () => {
				const result = await fn(cache ?? await readFromDisk());
				await writeToDisk(result.next);
				cache = result.next;
				return result.result;
			});
			inflight = next.catch(() => void 0);
			return next;
		}
	};
}

//#endregion
//#region src/main/store/goals.ts
const store$3 = makeStore("goals.json", () => []);
function rowToGoal(row) {
	return {
		id: row.id,
		title: row.title,
		description: row.description,
		context: row.context,
		status: row.status,
		createdAt: row.created_at,
		updatedAt: row.updated_at
	};
}
async function listGoals() {
	const db = await getDb();
	if (db) return (await db.execute("SELECT * FROM goals ORDER BY created_at ASC")).rows.map((r) => rowToGoal(r));
	return store$3.load();
}
async function listActiveGoals() {
	const db = await getDb();
	if (db) return (await db.execute("SELECT * FROM goals WHERE status = 'active' ORDER BY created_at ASC")).rows.map((r) => rowToGoal(r));
	return (await store$3.load()).filter((g) => g.status === "active");
}
async function getGoal(id) {
	const db = await getDb();
	if (db) {
		const rs = await db.execute({
			sql: "SELECT * FROM goals WHERE id = ?",
			args: [id]
		});
		if (rs.rows.length === 0) return null;
		return rowToGoal(rs.rows[0]);
	}
	return (await store$3.load()).find((g) => g.id === id) ?? null;
}
async function addGoal(input) {
	const trimmed = input.title.trim();
	if (!trimmed) throw new Error("Goal title is required");
	const db = await getDb();
	if (db) {
		const now = (/* @__PURE__ */ new Date()).toISOString();
		const goal = {
			id: (0, node_crypto.randomUUID)(),
			title: trimmed,
			description: input.description?.trim() || null,
			context: input.context?.trim() || null,
			status: "active",
			createdAt: now,
			updatedAt: now
		};
		await db.execute({
			sql: "INSERT INTO goals (id, title, description, context, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
			args: [
				goal.id,
				goal.title,
				goal.description,
				goal.context,
				goal.status,
				goal.createdAt,
				goal.updatedAt
			]
		});
		return goal;
	}
	return store$3.mutate((current) => {
		const now = (/* @__PURE__ */ new Date()).toISOString();
		const goal = {
			id: (0, node_crypto.randomUUID)(),
			title: trimmed,
			description: input.description?.trim() || null,
			context: input.context?.trim() || null,
			status: "active",
			createdAt: now,
			updatedAt: now
		};
		return {
			next: [...current, goal],
			result: goal
		};
	});
}
async function updateGoal(id, updates) {
	const db = await getDb();
	if (db) {
		const now = (/* @__PURE__ */ new Date()).toISOString();
		const sets = [];
		const args = [];
		if ("title" in updates && updates.title !== void 0) {
			sets.push("title = ?");
			args.push(updates.title.trim());
		}
		if ("description" in updates) {
			sets.push("description = ?");
			args.push(updates.description?.trim() || null);
		}
		if ("context" in updates) {
			sets.push("context = ?");
			args.push(updates.context?.trim() || null);
		}
		if ("status" in updates && updates.status) {
			sets.push("status = ?");
			args.push(updates.status);
		}
		if (sets.length > 0) {
			sets.push("updated_at = ?");
			args.push(now);
			args.push(id);
			const rs = await db.execute({
				sql: `UPDATE goals SET ${sets.join(", ")} WHERE id = ? RETURNING *`,
				args
			});
			if (rs.rows.length === 0) throw new Error(`Goal not found: ${id}`);
			return rowToGoal(rs.rows[0]);
		}
		return getGoal(id);
	}
	return store$3.mutate((current) => {
		const idx = current.findIndex((g) => g.id === id);
		if (idx === -1) throw new Error(`Goal not found: ${id}`);
		const next = {
			...current[idx],
			..."title" in updates && updates.title !== void 0 ? { title: updates.title.trim() } : {},
			..."description" in updates ? { description: updates.description?.trim() || null } : {},
			..."context" in updates ? { context: updates.context?.trim() || null } : {},
			..."status" in updates && updates.status ? { status: updates.status } : {},
			updatedAt: (/* @__PURE__ */ new Date()).toISOString()
		};
		const nextList = [...current];
		nextList[idx] = next;
		return {
			next: nextList,
			result: next
		};
	});
}
async function deleteGoal(id) {
	const db = await getDb();
	if (db) {
		await db.execute({
			sql: "DELETE FROM goals WHERE id = ?",
			args: [id]
		});
		return;
	}
	await store$3.mutate((current) => ({
		next: current.filter((g) => g.id !== id),
		result: void 0
	}));
}

//#endregion
//#region src/main/claude/cli.ts
const execFileAsync = (0, node_util.promisify)(node_child_process.execFile);
var ClaudeCliError = class extends Error {
	constructor(message, raw) {
		super(message);
		this.raw = raw;
		this.name = "ClaudeCliError";
	}
};
/**
* Run `claude -p` and return the assistant's textual result.
* Uses --output-format json so we get a structured wrapper around the result.
*/
async function runClaude(opts) {
	const streaming = typeof opts.onEvent === "function";
	const args = [
		"-p",
		opts.prompt,
		"--output-format",
		streaming ? "stream-json" : "json",
		"--permission-mode",
		"bypassPermissions"
	];
	if (streaming) args.push("--verbose");
	if (opts.model) args.push("--model", opts.model);
	if (opts.allowedTools?.length) args.push("--allowed-tools", opts.allowedTools.join(" "));
	const binary = opts.binary ?? process.env.CLAUDE_BIN ?? "claude";
	const maxBuffer = opts.maxBuffer ?? 16 * 1024 * 1024;
	const augmentedPath = [
		process.env.PATH,
		"/opt/homebrew/bin",
		"/usr/local/bin",
		`${process.env.HOME ?? ""}/.local/bin`
	].filter(Boolean).join(":");
	const env = {
		...process.env,
		PATH: augmentedPath
	};
	if (streaming) return runClaudeStreaming(binary, args, env, opts.onEvent);
	let stdout;
	try {
		stdout = (await execFileAsync(binary, args, {
			maxBuffer,
			env
		})).stdout;
	} catch (err) {
		const e = err;
		throw new ClaudeCliError(`claude CLI failed (binary=${binary}): ${e.message}${e.stderr ? `\n${e.stderr}` : ""}`, e.stdout);
	}
	let parsed;
	try {
		parsed = JSON.parse(stdout);
	} catch {
		throw new ClaudeCliError(`claude CLI returned non-JSON output`, stdout);
	}
	if (parsed.is_error) throw new ClaudeCliError(`claude CLI reported an error: ${parsed.result}`, stdout);
	return parsed.result;
}
function runClaudeStreaming(binary, args, env, onEvent) {
	return new Promise((resolve, reject) => {
		const proc = (0, node_child_process.spawn)(binary, args, { env });
		let buffer = "";
		let stderrBuf = "";
		let finalResult;
		let finalIsError = false;
		proc.stdout.setEncoding("utf8");
		proc.stdout.on("data", (chunk) => {
			buffer += chunk;
			let idx;
			while ((idx = buffer.indexOf("\n")) !== -1) {
				const line = buffer.slice(0, idx).trim();
				buffer = buffer.slice(idx + 1);
				if (!line) continue;
				let event;
				try {
					event = JSON.parse(line);
				} catch {
					continue;
				}
				if (event.type === "result") {
					const r = event;
					finalResult = r.result;
					finalIsError = !!r.is_error;
				}
				try {
					onEvent(event);
				} catch (err) {
					console.error("[claude/cli] onEvent threw:", err);
				}
			}
		});
		proc.stderr.setEncoding("utf8");
		proc.stderr.on("data", (chunk) => {
			stderrBuf += chunk;
		});
		proc.on("error", (err) => {
			reject(new ClaudeCliError(`claude CLI spawn failed (binary=${binary}): ${err.message}`));
		});
		proc.on("close", (code) => {
			if (code !== 0 && finalResult === void 0) {
				reject(new ClaudeCliError(`claude CLI exited with code ${code}${stderrBuf ? `\n${stderrBuf}` : ""}`));
				return;
			}
			if (finalIsError) {
				reject(new ClaudeCliError(`claude CLI reported an error: ${finalResult ?? ""}`));
				return;
			}
			if (finalResult === void 0) {
				reject(new ClaudeCliError(`claude CLI completed without a result event`));
				return;
			}
			resolve(finalResult);
		});
	});
}

//#endregion
//#region src/main/claude/generate.ts
const DEFAULT_MODEL = "claude-haiku-4-5";
const SYSTEM_INSTRUCTIONS = `You are Komorebi, a personal AI that turns long-term goals into one concrete daily action.

For the given goal, produce ONE specific action the user can do today that meaningfully advances the goal.

Rules:
- Be concrete. "Read about React hooks" is bad. "Read 'A Complete Guide to useEffect' by Dan Abramov (overreacted.io)" is good.
- Use WebSearch to find real, current, high-quality resources. Always include a real URL when one exists.
- Don't repeat past suggestions in the history. Match difficulty and style to what the user actually engaged with.
- READ the history carefully:
   - 👍 means the user liked it → produce more in that direction.
   - 👎 means the user didn't → change the level, style, or angle.
   - [skipped] means they bounced off it → likely too long, too generic, or wrong time of day.
   - "↳" lines are the user's own notes about how it went. These outrank everything else.
- If a "Context" section is provided, USE it — match the time estimate to actual open time, don't suggest something that conflicts with scheduled events, and let what's happening today shape the suggestion.
- Respect estimated time. Default to 20–40 minutes unless the user's context implies otherwise.
- The detailMarkdown is the page the user opens — include the link, why this resource, and what to focus on. Markdown formatting OK.

You MUST respond with ONLY a JSON object (no prose, no code fences). Shape:
{
  "title": string,           // <60 chars, what shows on the checklist
  "summary": string,         // 1 sentence, what shows under the title
  "detailMarkdown": string,  // The full detail page content
  "resourceUrl": string | null,
  "estimatedMinutes": number | null
}`;
async function generateSuggestion(input) {
	return parseDraft(await runClaude({
		prompt: buildPrompt(input),
		model: input.model ?? DEFAULT_MODEL,
		allowedTools: ["WebSearch"],
		onEvent: input.onStatus ? makeStatusTranslator(input.onStatus) : void 0
	}));
}
function makeStatusTranslator(onStatus) {
	let sawFirstTextAfterTool = false;
	let toolTurns = 0;
	return (event) => {
		if (event.type === "system") {
			onStatus("Reading your goal…");
			return;
		}
		if (event.type === "assistant") {
			const content = event.message?.content;
			if (!Array.isArray(content)) return;
			for (const block of content) {
				const blockType = block.type;
				if (blockType === "tool_use") {
					toolTurns++;
					const name = typeof block.name === "string" ? block.name : "";
					const inputObj = block.input ?? {};
					if (name === "WebSearch") {
						const q = typeof inputObj.query === "string" ? inputObj.query.trim() : "";
						onStatus(q ? `Searching: ${truncate(q, 48)}` : "Searching the web…");
					} else if (name === "WebFetch") {
						const host = hostnameOf(typeof inputObj.url === "string" ? inputObj.url : "");
						onStatus(host ? `Reading ${host}…` : "Fetching a source…");
					} else if (name) onStatus(`Running ${name}…`);
				} else if (blockType === "text") {
					if (!(typeof block.text === "string" ? block.text.trim() : "")) continue;
					if (toolTurns > 0 && !sawFirstTextAfterTool) {
						sawFirstTextAfterTool = true;
						onStatus("Drafting today's action…");
					}
				}
			}
			return;
		}
	};
}
function truncate(s, max) {
	if (s.length <= max) return s;
	return s.slice(0, max - 1).trimEnd() + "…";
}
function hostnameOf(url) {
	try {
		return new URL(url).hostname.replace(/^www\./, "");
	} catch {
		return "";
	}
}
function buildPrompt(input) {
	const { goal, history, date, contextBlocks } = input;
	const goalBlock = [
		`Goal: ${goal.title}`,
		goal.description ? `Description: ${goal.description}` : null,
		goal.context ? `User context: ${goal.context}` : null,
		`Today's date: ${date}`
	].filter(Boolean).join("\n");
	const historyBlock = history.length ? history.map(formatHistoryItem).join("\n") : "(none yet — this is the first suggestion for this goal)";
	return `${SYSTEM_INSTRUCTIONS}

---
${contextBlocks?.length ? `\n\n## Context\n\n${contextBlocks.map((b) => `### ${b.label}\n${b.body}`).join("\n\n")}` : ""}

## Goal

${goalBlock}

## Recent history (don't repeat these)

${historyBlock}

Generate one suggestion now.`;
}
function formatHistoryItem({ suggestion: s, reflections }) {
	const ratingMark = s.rating === "up" ? "👍 " : s.rating === "down" ? "👎 " : "";
	const head = `- ${s.date} [${s.status}] ${ratingMark}${s.title}` + (s.resourceUrl ? ` (${s.resourceUrl})` : "");
	if (reflections.length === 0) return head;
	return `${head}\n${reflections.map((r) => `  ↳ "${r.text.replace(/\s+/g, " ").trim()}"`).join("\n")}`;
}
function parseDraft(raw) {
	const cleaned = stripCodeFences(raw).trim();
	let parsed;
	try {
		parsed = JSON.parse(cleaned);
	} catch {
		throw new ClaudeCliError(`Could not parse suggestion JSON`, raw);
	}
	if (!parsed || typeof parsed !== "object") throw new ClaudeCliError(`Suggestion JSON was not an object`, raw);
	const obj = parsed;
	for (const key of [
		"title",
		"summary",
		"detailMarkdown"
	]) if (typeof obj[key] !== "string" || obj[key].length === 0) throw new ClaudeCliError(`Suggestion JSON missing required string field: ${key}`, raw);
	return {
		title: obj.title,
		summary: obj.summary,
		detailMarkdown: obj.detailMarkdown,
		resourceUrl: typeof obj.resourceUrl === "string" ? obj.resourceUrl : null,
		estimatedMinutes: typeof obj.estimatedMinutes === "number" && Number.isFinite(obj.estimatedMinutes) ? Math.round(obj.estimatedMinutes) : null
	};
}
function stripCodeFences(text) {
	return text.match(/```(?:json)?\s*([\s\S]*?)\s*```/)?.[1] ?? text;
}

//#endregion
//#region src/main/context/providers/googleCalendar.ts
function getClient$1() {
	const apiKey = process.env.COMPOSIO_API_KEY?.trim();
	if (!apiKey) throw new Error("COMPOSIO_API_KEY missing");
	return new _composio_core.Composio({ apiKey });
}
const WAKING_HOURS = 14;
const googleCalendarProvider = {
	toolkitSlug: "googlecalendar",
	label: "Today's calendar",
	async fetch({ userId }) {
		const start = /* @__PURE__ */ new Date();
		start.setHours(0, 0, 0, 0);
		const end = /* @__PURE__ */ new Date();
		end.setHours(23, 59, 59, 999);
		const result = await getClient$1().tools.execute("GOOGLECALENDAR_EVENTS_LIST", {
			userId,
			arguments: {
				calendarId: "primary",
				timeMin: start.toISOString(),
				timeMax: end.toISOString(),
				maxResults: 30,
				singleEvents: true,
				orderBy: "startTime"
			},
			dangerouslySkipVersionCheck: true
		});
		if (!result.successful) throw new Error(`GOOGLECALENDAR_EVENTS_LIST failed: ${result.error}`);
		const data = result.data;
		const events = data.items ?? data.response_data?.items ?? [];
		if (events.length === 0) return `No events scheduled today — roughly ${WAKING_HOURS}h of open time.`;
		const lines = [];
		let blockedMinutes = 0;
		for (const e of events) {
			if (!e.start || !e.end) continue;
			const startStr = e.start.dateTime ?? e.start.date;
			const endStr = e.end.dateTime ?? e.end.date;
			if (!startStr || !endStr) continue;
			const isAllDay = Boolean(e.start.date) && !e.start.dateTime;
			const startDate = new Date(startStr);
			const endDate = new Date(endStr);
			const durMin = Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 6e4));
			if (!isAllDay) blockedMinutes += durMin;
			const timeFmt = (d) => d.toLocaleTimeString(void 0, {
				hour: "numeric",
				minute: "2-digit"
			});
			const tag = isAllDay ? "all day" : `${timeFmt(startDate)}–${timeFmt(endDate)}`;
			lines.push(`- ${tag}: ${e.summary ?? "(no title)"}`);
		}
		const openHours = (Math.max(0, WAKING_HOURS * 60 - blockedMinutes) / 60).toFixed(1);
		return `${lines.join("\n")}\n\n~${openHours}h of open time today.`;
	}
};

//#endregion
//#region src/main/context/providers/strava.ts
function getClient() {
	const apiKey = process.env.COMPOSIO_API_KEY?.trim();
	if (!apiKey) throw new Error("COMPOSIO_API_KEY missing");
	return new _composio_core.Composio({ apiKey });
}
const WINDOW_DAYS = 14;
const stravaProvider = {
	toolkitSlug: "strava",
	label: "Recent activity",
	async fetch({ userId }) {
		const after = Math.floor((Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1e3) / 1e3);
		const result = await getClient().tools.execute("STRAVA_GET_LOGGED_IN_ATHLETE_ACTIVITIES", {
			userId,
			arguments: {
				per_page: 30,
				after
			},
			dangerouslySkipVersionCheck: true
		});
		if (!result.successful) throw new Error(`STRAVA_GET_LOGGED_IN_ATHLETE_ACTIVITIES failed: ${result.error}`);
		const activities = extractActivities(result.data);
		if (activities.length === 0) return `No Strava activities logged in the last ${WINDOW_DAYS} days.`;
		const sorted = [...activities].sort((a, b) => (b.start_date_local ?? "").localeCompare(a.start_date_local ?? ""));
		let totalMeters = 0;
		let totalSeconds = 0;
		const byType = /* @__PURE__ */ new Map();
		for (const a of sorted) {
			totalMeters += typeof a.distance === "number" ? a.distance : 0;
			totalSeconds += typeof a.moving_time === "number" ? a.moving_time : 0;
			const kind = (a.sport_type || a.type || "Activity").replace(/([a-z])([A-Z])/g, "$1 $2");
			byType.set(kind, (byType.get(kind) ?? 0) + 1);
		}
		const typeBreakdown = [...byType.entries()].sort((a, b) => b[1] - a[1]).map(([kind, n]) => `${n}× ${kind}`).join(", ");
		const lines = [`${sorted.length} activit${sorted.length === 1 ? "y" : "ies"} in the last ${WINDOW_DAYS} days — ${typeBreakdown}.`, `Total: ${formatKm(totalMeters)} over ${formatDuration(totalSeconds)}.`];
		const recent = sorted.slice(0, 3).map((a) => {
			const kind = (a.sport_type || a.type || "Activity").replace(/([a-z])([A-Z])/g, "$1 $2");
			const when = formatDate(a.start_date_local);
			const bits = [
				kind,
				formatKm(a.distance ?? 0),
				formatDuration(a.moving_time ?? 0)
			].filter((s) => s && s !== "0 km" && s !== "0m").join(", ");
			return `- ${when}: ${a.name?.trim() || kind} (${bits})`;
		});
		return `${lines.join(" ")}\n\nMost recent:\n${recent.join("\n")}`;
	}
};
function extractActivities(data) {
	if (Array.isArray(data)) return data;
	const obj = data ?? {};
	const candidate = obj.response_data ?? obj.data ?? obj.activities ?? obj.items ?? [];
	return Array.isArray(candidate) ? candidate : [];
}
function formatKm(meters) {
	const km = meters / 1e3;
	if (km < .05) return "0 km";
	return `${km.toFixed(km < 10 ? 1 : 0)} km`;
}
function formatDuration(seconds) {
	const mins = Math.round(seconds / 60);
	if (mins < 60) return `${mins}m`;
	const h = Math.floor(mins / 60);
	const m = mins % 60;
	return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
function formatDate(iso) {
	if (!iso) return "recently";
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return "recently";
	return d.toLocaleDateString(void 0, {
		weekday: "short",
		month: "short",
		day: "numeric"
	});
}

//#endregion
//#region src/main/context/providers/weather.ts
/**
* Daily weather summary for Claude. Critically: the *day's* shape, not the
* moment of generation. Otherwise a checklist composed at 7am full of "great
* for tonight" suggestions arrives at the user's evening read.
*/
async function fetchWeatherContext(location) {
	const w = await getCurrentWeather(location);
	if (!w) return null;
	const d = w.daily;
	const parts = [`${w.resolvedName} today: ${d.description.toLowerCase()}, high ${d.tempMaxC}°C / low ${d.tempMinC}°C.`];
	if (d.precipitationProbabilityPct >= 30) parts.push(`${d.precipitationProbabilityPct}% chance of precipitation (~${d.precipitationMm}mm).`);
	return parts.join(" ");
}

//#endregion
//#region src/main/context/registry.ts
const providers = [googleCalendarProvider, stravaProvider];
const bySlug = new Map(providers.map((p) => [p.toolkitSlug, p]));
function getProvider(slug) {
	return bySlug.get(slug);
}
/**
* Always-on providers don't require an explicit user connection (e.g. they
* back onto a NO_AUTH toolkit or an app-managed source). They run once per
* generation pass regardless of which integrations the user has enabled.
*/
async function buildAlwaysOnBlocks() {
	const blocks = [];
	try {
		const city = Intl.DateTimeFormat().resolvedOptions().timeZone.split("/").pop()?.replace(/_/g, " ") ?? "";
		if (city) {
			const body = await fetchWeatherContext(city);
			if (body) blocks.push({
				label: "Weather",
				toolkitSlug: "weathermap",
				body
			});
		}
	} catch (err) {
		console.error("[context] weather always-on provider failed:", err);
	}
	return blocks;
}
/**
* Fan out across every connected integration that has a registered provider,
* fetch their context blocks in parallel, and collect the non-empty ones.
* Failures in any one provider are logged but don't block the rest.
*
* Additionally include any always-on context blocks (weather, etc.).
*/
async function buildContextBlocks(input) {
	const connTasks = input.connections.map(async (conn) => {
		const provider = getProvider(conn.toolkitSlug);
		if (!provider) return null;
		if (conn.status !== "ACTIVE" && !conn.status.toLowerCase().includes("active")) return null;
		try {
			const body = await provider.fetch({
				userId: input.userId,
				connection: conn
			});
			if (!body) return null;
			return {
				label: provider.label,
				toolkitSlug: conn.toolkitSlug,
				body
			};
		} catch (err) {
			console.error(`[context] provider "${conn.toolkitSlug}" failed:`, err);
			return null;
		}
	});
	const [connResults, alwaysOn] = await Promise.all([Promise.all(connTasks), buildAlwaysOnBlocks()]);
	return [...alwaysOn, ...connResults.filter((b) => b !== null)];
}

//#endregion
//#region src/main/store/reflections.ts
const store$2 = makeStore("reflections.json", () => []);
function rowToReflection(row) {
	return {
		id: row.id,
		suggestionId: row.suggestion_id,
		text: row.text,
		rating: row.rating,
		createdAt: row.created_at
	};
}
async function listReflectionsForSuggestion(suggestionId) {
	const db = await getDb();
	if (db) return (await db.execute({
		sql: "SELECT * FROM reflections WHERE suggestion_id = ? ORDER BY created_at ASC",
		args: [suggestionId]
	})).rows.map((r) => rowToReflection(r));
	return (await store$2.load()).filter((r) => r.suggestionId === suggestionId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
async function listAllReflections() {
	const db = await getDb();
	if (db) return (await db.execute("SELECT * FROM reflections ORDER BY created_at ASC")).rows.map((r) => rowToReflection(r));
	return store$2.load();
}
async function addReflection(input) {
	const trimmed = input.text.trim();
	if (!trimmed) throw new Error("Reflection text is required");
	const db = await getDb();
	if (db) {
		const reflection = {
			id: (0, node_crypto.randomUUID)(),
			suggestionId: input.suggestionId,
			text: trimmed,
			rating: input.rating ?? null,
			createdAt: (/* @__PURE__ */ new Date()).toISOString()
		};
		await db.execute({
			sql: "INSERT INTO reflections (id, suggestion_id, text, rating, created_at) VALUES (?, ?, ?, ?, ?)",
			args: [
				reflection.id,
				reflection.suggestionId,
				reflection.text,
				reflection.rating,
				reflection.createdAt
			]
		});
		return reflection;
	}
	return store$2.mutate((current) => {
		const reflection = {
			id: (0, node_crypto.randomUUID)(),
			suggestionId: input.suggestionId,
			text: trimmed,
			rating: input.rating ?? null,
			createdAt: (/* @__PURE__ */ new Date()).toISOString()
		};
		return {
			next: [...current, reflection],
			result: reflection
		};
	});
}
async function deleteReflectionsForSuggestions(suggestionIds) {
	if (suggestionIds.length === 0) return;
	const db = await getDb();
	if (db) {
		const placeholders = suggestionIds.map(() => "?").join(", ");
		await db.execute({
			sql: `DELETE FROM reflections WHERE suggestion_id IN (${placeholders})`,
			args: suggestionIds
		});
		return;
	}
	const ids = new Set(suggestionIds);
	await store$2.mutate((current) => ({
		next: current.filter((r) => !ids.has(r.suggestionId)),
		result: void 0
	}));
}

//#endregion
//#region src/main/store/suggestions.ts
const store$1 = makeStore("suggestions.json", () => []);
function rowToSuggestion(row) {
	return {
		id: row.id,
		goalId: row.goal_id,
		date: row.date,
		title: row.title,
		summary: row.summary,
		detailMarkdown: row.detail_markdown,
		resourceUrl: row.resource_url,
		estimatedMinutes: row.estimated_minutes,
		status: row.status,
		rating: row.rating,
		createdAt: row.created_at,
		completedAt: row.completed_at
	};
}
async function listAllSuggestions() {
	const db = await getDb();
	if (db) return (await db.execute("SELECT * FROM suggestions ORDER BY created_at ASC")).rows.map((r) => rowToSuggestion(r));
	return (await store$1.load()).map(hydrate);
}
async function listSuggestionsForDate(date) {
	const db = await getDb();
	if (db) return (await db.execute({
		sql: "SELECT * FROM suggestions WHERE date = ? ORDER BY created_at ASC",
		args: [date]
	})).rows.map((r) => rowToSuggestion(r));
	return (await store$1.load()).filter((s) => s.date === date).map(hydrate).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
async function listRecentSuggestionsForGoal(goalId, limit) {
	const db = await getDb();
	if (db) return (await db.execute({
		sql: "SELECT * FROM suggestions WHERE goal_id = ? ORDER BY date DESC, created_at DESC LIMIT ?",
		args: [goalId, limit]
	})).rows.map((r) => rowToSuggestion(r));
	return (await store$1.load()).filter((s) => s.goalId === goalId).map(hydrate).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
}
async function getSuggestion(id) {
	const db = await getDb();
	if (db) {
		const rs = await db.execute({
			sql: "SELECT * FROM suggestions WHERE id = ?",
			args: [id]
		});
		if (rs.rows.length === 0) return null;
		return rowToSuggestion(rs.rows[0]);
	}
	const found = (await store$1.load()).find((s) => s.id === id);
	return found ? hydrate(found) : null;
}
async function insertSuggestion(input) {
	const db = await getDb();
	if (db) {
		const now = (/* @__PURE__ */ new Date()).toISOString();
		const suggestion = {
			id: (0, node_crypto.randomUUID)(),
			goalId: input.goalId,
			date: input.date,
			title: input.draft.title,
			summary: input.draft.summary,
			detailMarkdown: input.draft.detailMarkdown,
			resourceUrl: input.draft.resourceUrl,
			estimatedMinutes: input.draft.estimatedMinutes,
			status: "pending",
			rating: null,
			createdAt: now,
			completedAt: null
		};
		await db.execute({
			sql: "INSERT INTO suggestions (id, goal_id, date, title, summary, detail_markdown, resource_url, estimated_minutes, status, rating, created_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
			args: [
				suggestion.id,
				suggestion.goalId,
				suggestion.date,
				suggestion.title,
				suggestion.summary,
				suggestion.detailMarkdown,
				suggestion.resourceUrl,
				suggestion.estimatedMinutes,
				suggestion.status,
				suggestion.rating,
				suggestion.createdAt,
				suggestion.completedAt
			]
		});
		return suggestion;
	}
	return store$1.mutate((current) => {
		const now = (/* @__PURE__ */ new Date()).toISOString();
		const suggestion = {
			id: (0, node_crypto.randomUUID)(),
			goalId: input.goalId,
			date: input.date,
			title: input.draft.title,
			summary: input.draft.summary,
			detailMarkdown: input.draft.detailMarkdown,
			resourceUrl: input.draft.resourceUrl,
			estimatedMinutes: input.draft.estimatedMinutes,
			status: "pending",
			rating: null,
			createdAt: now,
			completedAt: null
		};
		return {
			next: [...current, suggestion],
			result: suggestion
		};
	});
}
async function updateSuggestionStatus(id, status) {
	const db = await getDb();
	if (db) {
		const completedAt = status === "done" ? (/* @__PURE__ */ new Date()).toISOString() : null;
		const rs = await db.execute({
			sql: "UPDATE suggestions SET status = ?, completed_at = COALESCE(?, completed_at) WHERE id = ? RETURNING *",
			args: [
				status,
				completedAt,
				id
			]
		});
		if (rs.rows.length === 0) throw new Error(`Suggestion not found: ${id}`);
		return rowToSuggestion(rs.rows[0]);
	}
	return store$1.mutate((current) => {
		const idx = current.findIndex((s) => s.id === id);
		if (idx === -1) throw new Error(`Suggestion not found: ${id}`);
		const existing = hydrate(current[idx]);
		const next = {
			...existing,
			status,
			completedAt: status === "done" ? (/* @__PURE__ */ new Date()).toISOString() : existing.completedAt
		};
		const nextList = [...current];
		nextList[idx] = next;
		return {
			next: nextList,
			result: next
		};
	});
}
async function updateSuggestionRating(id, rating) {
	const db = await getDb();
	if (db) {
		const rs = await db.execute({
			sql: "UPDATE suggestions SET rating = ? WHERE id = ? RETURNING *",
			args: [rating, id]
		});
		if (rs.rows.length === 0) throw new Error(`Suggestion not found: ${id}`);
		return rowToSuggestion(rs.rows[0]);
	}
	return store$1.mutate((current) => {
		const idx = current.findIndex((s) => s.id === id);
		if (idx === -1) throw new Error(`Suggestion not found: ${id}`);
		const next = {
			...hydrate(current[idx]),
			rating
		};
		const nextList = [...current];
		nextList[idx] = next;
		return {
			next: nextList,
			result: next
		};
	});
}
/** Returns the IDs of the suggestions that were removed. */
async function deleteSuggestionsForGoal(goalId) {
	const db = await getDb();
	if (db) return (await db.execute({
		sql: "DELETE FROM suggestions WHERE goal_id = ? RETURNING id",
		args: [goalId]
	})).rows.map((r) => r.id);
	return store$1.mutate((current) => {
		const removed = current.filter((s) => s.goalId === goalId).map((s) => s.id);
		return {
			next: current.filter((s) => s.goalId !== goalId),
			result: removed
		};
	});
}
function hydrate(s) {
	return {
		...s,
		rating: s.rating ?? null
	};
}

//#endregion
//#region src/main/checklist/orchestrator.ts
/** YYYY-MM-DD in the user's local timezone. */
function localDate(d = /* @__PURE__ */ new Date()) {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
async function getTodayChecklist() {
	const date = localDate();
	const [items, goals] = await Promise.all([listSuggestionsForDate(date), listActiveGoals()]);
	return {
		date,
		items,
		hasGoals: goals.length > 0
	};
}
/**
* Coalesce concurrent generations for the same day into one. Both the daily
* scheduler (main) and the Today page's auto-fire (renderer→IPC) can kick off
* a generation on first launch; without this they'd each read an empty list
* and insert duplicate suggestions for every goal.
*/
let inFlightToday = null;
/**
* Generate one suggestion for each active goal for today.
* Skips goals that already have a suggestion today (idempotent).
* Emits progress events the renderer can subscribe to so the UI can
* fill in placeholders as each goal completes.
*/
async function generateTodayChecklist() {
	const date = localDate();
	if (inFlightToday && inFlightToday.date === date) return inFlightToday.promise;
	const promise = runGenerateTodayChecklist(date);
	inFlightToday = {
		date,
		promise
	};
	try {
		return await promise;
	} finally {
		if (inFlightToday?.promise === promise) inFlightToday = null;
	}
}
async function runGenerateTodayChecklist(date) {
	const [activeGoals, existing] = await Promise.all([listActiveGoals(), listSuggestionsForDate(date)]);
	if (activeGoals.length === 0) return {
		date,
		items: existing,
		hasGoals: false
	};
	const alreadyCovered = new Set(existing.filter((s) => s.status !== "skipped").map((s) => s.goalId));
	const goalsToGenerate = activeGoals.filter((g) => !alreadyCovered.has(g.id));
	if (goalsToGenerate.length === 0) return {
		date,
		items: existing,
		hasGoals: true
	};
	emitProgress({
		phase: "start",
		goals: goalsToGenerate.map((g) => ({
			id: g.id,
			title: g.title
		}))
	});
	let contextBlocks = [];
	try {
		const userId = getUserId();
		contextBlocks = await buildContextBlocks({
			userId,
			connections: await listConnections(userId)
		});
	} catch (err) {
		console.error("[orchestrator] context fetch failed (proceeding without):", err);
	}
	emitProgress({
		phase: "context-fetched",
		labels: contextBlocks.map((b) => b.label)
	});
	const newSuggestions = await Promise.all(goalsToGenerate.map(async (goal) => {
		emitProgress({
			phase: "goal-start",
			goalId: goal.id
		});
		try {
			const recent = await listRecentSuggestionsForGoal(goal.id, 14);
			const draft = await generateSuggestion({
				goal,
				history: await Promise.all(recent.map(async (s) => ({
					suggestion: s,
					reflections: await listReflectionsForSuggestion(s.id)
				}))),
				date,
				contextBlocks,
				onStatus: (label) => emitProgress({
					phase: "goal-status",
					goalId: goal.id,
					label
				})
			});
			const inserted = await insertSuggestion({
				goalId: goal.id,
				date,
				draft
			});
			emitProgress({
				phase: "goal-done",
				goalId: goal.id,
				suggestion: inserted
			});
			return inserted;
		} catch (err) {
			const message = err.message ?? "Unknown error";
			emitProgress({
				phase: "goal-error",
				goalId: goal.id,
				message
			});
			throw err;
		}
	}));
	const items = [...existing, ...newSuggestions].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
	emitProgress({
		phase: "done",
		items
	});
	return {
		date,
		items,
		hasGoals: true
	};
}
/**
* Past days, newest first, with each day's suggestions and the
* reflections attached to each one. Excludes today (which has its
* own tab). Capped at `daysBack`.
*/
async function getHistory(daysBack = 30) {
	const today = localDate();
	const [allSuggestions, allReflections] = await Promise.all([listAllSuggestions(), listAllReflections()]);
	const byDate = /* @__PURE__ */ new Map();
	for (const s of allSuggestions) {
		if (s.date >= today) continue;
		const bucket = byDate.get(s.date) ?? [];
		bucket.push(s);
		byDate.set(s.date, bucket);
	}
	const reflectionsBySuggestion = /* @__PURE__ */ new Map();
	for (const r of allReflections) {
		const bucket = reflectionsBySuggestion.get(r.suggestionId) ?? [];
		bucket.push(r);
		reflectionsBySuggestion.set(r.suggestionId, bucket);
	}
	return [...byDate.keys()].sort().reverse().slice(0, daysBack).map((date) => {
		const items = (byDate.get(date) ?? []).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
		const reflectionsByItem = {};
		for (const item of items) {
			const refs = (reflectionsBySuggestion.get(item.id) ?? []).slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt));
			if (refs.length > 0) reflectionsByItem[item.id] = refs;
		}
		return {
			date,
			items,
			reflectionsByItem
		};
	});
}
/**
* Delete a goal and everything it owns (suggestions + their reflections).
* Order matters: collect IDs first, then delete leaves before the trunk.
*/
async function deleteGoalCascade(goalId) {
	await deleteReflectionsForSuggestions(await deleteSuggestionsForGoal(goalId));
	await deleteGoal(goalId);
}
/**
* Mark a suggestion as skipped, then generate a fresh suggestion for the same
* goal using current history + context. Returns the new suggestion.
*/
async function skipAndRegenerate(suggestionId) {
	const original = await getSuggestion(suggestionId);
	if (!original) throw new Error(`Suggestion not found: ${suggestionId}`);
	await updateSuggestionStatus(suggestionId, "skipped");
	const goal = await getGoal(original.goalId);
	if (!goal) throw new Error(`Goal not found: ${original.goalId}`);
	emitProgress({
		phase: "start",
		goals: [{
			id: goal.id,
			title: goal.title
		}]
	});
	let contextBlocks = [];
	try {
		const userId = getUserId();
		contextBlocks = await buildContextBlocks({
			userId,
			connections: await listConnections(userId)
		});
	} catch (err) {
		console.error("[orchestrator] context fetch failed (proceeding without):", err);
	}
	emitProgress({
		phase: "context-fetched",
		labels: contextBlocks.map((b) => b.label)
	});
	emitProgress({
		phase: "goal-start",
		goalId: goal.id
	});
	try {
		const recent = await listRecentSuggestionsForGoal(goal.id, 14);
		const history = await Promise.all(recent.map(async (s) => ({
			suggestion: s,
			reflections: await listReflectionsForSuggestion(s.id)
		})));
		const date = localDate();
		const draft = await generateSuggestion({
			goal,
			history,
			date,
			contextBlocks,
			onStatus: (label) => emitProgress({
				phase: "goal-status",
				goalId: goal.id,
				label
			})
		});
		const inserted = await insertSuggestion({
			goalId: goal.id,
			date,
			draft
		});
		emitProgress({
			phase: "goal-done",
			goalId: goal.id,
			suggestion: inserted
		});
		emitProgress({
			phase: "done",
			items: [inserted]
		});
		return inserted;
	} catch (err) {
		const message = err.message ?? "Unknown error";
		emitProgress({
			phase: "goal-error",
			goalId: goal.id,
			message
		});
		throw err;
	}
}

//#endregion
//#region src/main/links/preview.ts
const cache = /* @__PURE__ */ new Map();
const FETCH_TIMEOUT_MS = 6e3;
const MAX_BYTES = 512 * 1024;
async function fetchLinkPreview(rawUrl) {
	const cached = cache.get(rawUrl);
	if (cached) return cached;
	const empty = {
		url: rawUrl,
		title: null,
		description: null,
		imageUrl: null,
		siteName: null,
		favicon: null
	};
	let base;
	try {
		base = new URL(rawUrl);
	} catch {
		return empty;
	}
	if (base.protocol !== "http:" && base.protocol !== "https:") return empty;
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
	try {
		const res = await fetch(rawUrl, {
			signal: controller.signal,
			redirect: "follow",
			headers: {
				"user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Komorebi/1.0",
				accept: "text/html,application/xhtml+xml"
			}
		});
		const contentType = res.headers.get("content-type") ?? "";
		if (!res.ok || !contentType.includes("text/html") || !res.body) return cacheAndReturn(rawUrl, empty);
		return cacheAndReturn(rawUrl, parseHead(await readCapped(res.body, MAX_BYTES), base));
	} catch (err) {
		console.warn("[link-preview] fetch failed:", rawUrl, err instanceof Error ? err.message : err);
		return empty;
	} finally {
		clearTimeout(timer);
	}
}
function cacheAndReturn(url, preview) {
	cache.set(url, preview);
	return preview;
}
/** Read a stream up to `limit` bytes, then stop — we only need <head>. */
async function readCapped(body, limit) {
	const reader = body.getReader();
	const decoder = new TextDecoder("utf-8");
	let out = "";
	let total = 0;
	while (total < limit) {
		const { done, value } = await reader.read();
		if (done) break;
		total += value.byteLength;
		out += decoder.decode(value, { stream: true });
		if (/<\/head>/i.test(out)) break;
	}
	reader.cancel().catch(() => {});
	return out;
}
function parseHead(html, base) {
	const meta = (...names) => {
		for (const name of names) {
			const re = new RegExp(`<meta[^>]+(?:property|name)\\s*=\\s*["']${escapeRe(name)}["'][^>]*>`, "i");
			const tag = html.match(re)?.[0];
			if (!tag) continue;
			const content = tag.match(/content\s*=\s*["']([^"']*)["']/i)?.[1];
			if (content) return decodeEntities(content.trim());
		}
		return null;
	};
	const titleTag = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1];
	const title = meta("og:title", "twitter:title") ?? (titleTag ? decodeEntities(titleTag.trim()) : null);
	const description = meta("og:description", "twitter:description", "description");
	const image = meta("og:image", "og:image:url", "twitter:image", "twitter:image:src");
	const siteName = meta("og:site_name") ?? base.hostname.replace(/^www\./, "");
	return {
		url: base.toString(),
		title,
		description,
		imageUrl: image ? absolutize(image, base) : null,
		siteName,
		favicon: `https://www.google.com/s2/favicons?domain=${base.hostname}&sz=64`
	};
}
function absolutize(maybeRelative, base) {
	try {
		return new URL(maybeRelative, base).toString();
	} catch {
		return null;
	}
}
function escapeRe(s) {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function decodeEntities(s) {
	return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#0?39;/g, "'").replace(/&apos;/g, "'").replace(/&#x2F;/g, "/").replace(/&nbsp;/g, " ");
}

//#endregion
//#region src/main/store/settings.ts
const DEFAULTS = {
	schedule: {
		enabled: true,
		time: "07:00",
		lastRunDate: null
	},
	theme: "system"
};
const VALID_THEMES = new Set([
	"light",
	"dark",
	"system"
]);
const store = makeStore("settings.json", () => structuredCloneDefaults());
function structuredCloneDefaults() {
	return {
		schedule: { ...DEFAULTS.schedule },
		theme: DEFAULTS.theme
	};
}
async function getSettings() {
	const db = await getDb();
	if (db) {
		const rs = await db.execute("SELECT data FROM settings WHERE id = 1");
		if (rs.rows.length === 0) return structuredCloneDefaults();
		const raw = JSON.parse(rs.rows[0].data);
		return {
			schedule: {
				...DEFAULTS.schedule,
				...raw?.schedule ?? {}
			},
			theme: normalizeTheme(raw?.theme)
		};
	}
	const raw = await store.load();
	return {
		schedule: {
			...DEFAULTS.schedule,
			...raw?.schedule ?? {}
		},
		theme: normalizeTheme(raw?.theme)
	};
}
async function updateSettings(update) {
	const db = await getDb();
	if (db) {
		const current = await getSettings();
		const next = {
			schedule: {
				...DEFAULTS.schedule,
				...current.schedule,
				..."enabled" in update && update.enabled !== void 0 ? { enabled: update.enabled } : {},
				..."time" in update && update.time ? { time: normalizeTime(update.time) } : {}
			},
			theme: update.theme !== void 0 ? normalizeTheme(update.theme) : normalizeTheme(current.theme)
		};
		await db.execute({
			sql: "UPDATE settings SET data = ? WHERE id = 1",
			args: [JSON.stringify(next)]
		});
		return next;
	}
	return store.mutate((current) => {
		const base = current ?? structuredCloneDefaults();
		const schedule = {
			...DEFAULTS.schedule,
			...base.schedule,
			..."enabled" in update && update.enabled !== void 0 ? { enabled: update.enabled } : {},
			..."time" in update && update.time ? { time: normalizeTime(update.time) } : {}
		};
		const theme = update.theme !== void 0 ? normalizeTheme(update.theme) : normalizeTheme(base.theme);
		const next = {
			...base,
			schedule,
			theme
		};
		return {
			next,
			result: next
		};
	});
}
function normalizeTime(input) {
	const m = input.trim().match(/^(\d{1,2}):(\d{2})$/);
	if (!m) return DEFAULTS.schedule.time;
	const h = Math.min(23, Math.max(0, Number(m[1])));
	const min = Math.min(59, Math.max(0, Number(m[2])));
	return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}
function normalizeTheme(input) {
	return typeof input === "string" && VALID_THEMES.has(input) ? input : DEFAULTS.theme;
}

//#endregion
//#region src/server/routes.ts
const appVersion = readAppVersion();
function readAppVersion() {
	try {
		const moduleDir = typeof __dirname === "string" ? __dirname : node_path.default.dirname((0, node_url.fileURLToPath)(require("url").pathToFileURL(__filename).href));
		return JSON.parse(node_fs.default.readFileSync(node_path.default.join(moduleDir, "..", "..", "package.json"), "utf8")).version ?? "0.0.0";
	} catch {
		return process.env.npm_package_version ?? "0.0.0";
	}
}
async function handleApi(method, pathname, search, body) {
	if (method === "GET" && pathname === "/api/version") return appVersion;
	if (method === "GET" && pathname === "/api/integrations") return getIntegrations();
	if (method === "POST" && pathname === "/api/integrations/refresh") return refreshConnections();
	if (method === "POST" && pathname.startsWith("/api/integrations/") && pathname.endsWith("/connect")) return beginConnect(decodeURIComponent(pathname.slice(18, -8)));
	if (method === "POST" && pathname.startsWith("/api/integrations/") && pathname.endsWith("/await")) return awaitConnect(decodeURIComponent(pathname.slice(18, -6)));
	if (method === "POST" && pathname.startsWith("/api/integrations/") && pathname.endsWith("/disconnect")) {
		await disconnectIntegration(decodeURIComponent(pathname.slice(18, -11)));
		return { ok: true };
	}
	if (method === "GET" && pathname === "/api/goals") return listGoals();
	if (method === "POST" && pathname === "/api/goals") return addGoal(body);
	if (method === "PATCH" && pathname.startsWith("/api/goals/")) return updateGoal(decodeURIComponent(pathname.slice(11)), body.updates);
	if (method === "DELETE" && pathname.startsWith("/api/goals/")) {
		await deleteGoalCascade(decodeURIComponent(pathname.slice(11)));
		return { ok: true };
	}
	if (method === "GET" && pathname === "/api/checklist/today") return getTodayChecklist();
	if (method === "POST" && pathname === "/api/checklist/generate") return generateTodayChecklist();
	if (method === "GET" && pathname === "/api/history") {
		const params = new URLSearchParams(search);
		return getHistory(params.has("daysBack") ? Number(params.get("daysBack")) : void 0);
	}
	if (method === "GET" && pathname.startsWith("/api/suggestions/")) return getSuggestion(decodeURIComponent(pathname.slice(17)));
	if (method === "PATCH" && pathname.startsWith("/api/suggestions/") && pathname.endsWith("/status")) return updateSuggestionStatus(decodeURIComponent(pathname.slice(17, -7)), body.status);
	if (method === "PATCH" && pathname.startsWith("/api/suggestions/") && pathname.endsWith("/rating")) return updateSuggestionRating(decodeURIComponent(pathname.slice(17, -7)), body.rating);
	if (method === "POST" && pathname.startsWith("/api/suggestions/") && pathname.endsWith("/skip-regenerate")) return skipAndRegenerate(decodeURIComponent(pathname.slice(17, -16)));
	if (method === "GET" && pathname.startsWith("/api/reflections/")) return listReflectionsForSuggestion(decodeURIComponent(pathname.slice(17)));
	if (method === "POST" && pathname === "/api/reflections") return addReflection(body);
	if (method === "GET" && pathname === "/api/weather/current") return getCurrentWeather(new URLSearchParams(search).get("location") ?? "");
	if (method === "GET" && pathname === "/api/links/preview") return fetchLinkPreview(new URLSearchParams(search).get("url") ?? "");
	if (method === "GET" && pathname === "/api/settings") return getSettings();
	if (method === "PATCH" && pathname === "/api/settings") return updateSettings(body);
	throw new RouteNotFoundError();
}
var RouteNotFoundError = class extends Error {
	constructor() {
		super("Not found");
		this.name = "RouteNotFoundError";
	}
};

//#endregion
//#region src/server/http.ts
const moduleDir$1 = typeof __dirname === "string" ? __dirname : node_path.default.dirname((0, node_url.fileURLToPath)(require("url").pathToFileURL(__filename).href));
const MIME = {
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".json": "application/json",
	".svg": "image/svg+xml",
	".png": "image/png",
	".ico": "image/x-icon",
	".webmanifest": "application/manifest+json"
};
function createServer(options) {
	const staticDir = options.staticDir ?? node_path.default.join(moduleDir$1, "..", "..", "dist", "renderer");
	return node_http.default.createServer(async (req, res) => {
		try {
			if (!req.url) {
				res.writeHead(400).end();
				return;
			}
			const url = new URL(req.url, "http://local");
			const pathname = url.pathname;
			if (req.method === "OPTIONS") {
				writeCors(res);
				res.writeHead(204).end();
				return;
			}
			if (pathname === "/api/checklist/progress") {
				if (!authorize(req, options.apiToken, url)) {
					res.writeHead(401).end("Unauthorized");
					return;
				}
				handleProgressStream(req, res);
				return;
			}
			if (pathname.startsWith("/api/")) {
				if (!authorize(req, options.apiToken, url)) {
					res.writeHead(401, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "Unauthorized" }));
					return;
				}
				writeCors(res);
				const method = req.method ?? "GET";
				let body = void 0;
				if (method !== "GET" && method !== "HEAD") body = await readJsonBody(req);
				try {
					const result = await handleApi(method, pathname, url.search, body);
					res.writeHead(200, { "Content-Type": "application/json" });
					res.end(JSON.stringify(result));
				} catch (err) {
					if (err instanceof RouteNotFoundError) {
						res.writeHead(404, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "Not found" }));
						return;
					}
					console.error("[server] API error:", err);
					const message = err instanceof Error ? err.message : "Internal error";
					res.writeHead(500, { "Content-Type": "application/json" }).end(JSON.stringify({ error: message }));
				}
				return;
			}
			if (options.staticDir) {
				await serveStatic(req, res, staticDir, pathname);
				return;
			}
			res.writeHead(404).end("Not found");
		} catch (err) {
			console.error("[server] request failed:", err);
			if (!res.headersSent) res.writeHead(500).end("Internal error");
		}
	});
}
function authorize(req, token, url) {
	if (!token) return true;
	if ((req.headers.authorization ?? "") === `Bearer ${token}`) return true;
	if (url?.searchParams.get("token") === token) return true;
	return false;
}
function writeCors(res) {
	res.setHeader("Access-Control-Allow-Origin", "*");
	res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
	res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}
function handleProgressStream(req, res) {
	writeCors(res);
	res.writeHead(200, {
		"Content-Type": "text/event-stream",
		"Cache-Control": "no-cache",
		Connection: "keep-alive"
	});
	res.write(": connected\n\n");
	const unsubscribe = subscribeProgress((event) => {
		res.write(`data: ${JSON.stringify(event)}\n\n`);
	});
	const heartbeat = setInterval(() => {
		res.write(": ping\n\n");
	}, 25e3);
	req.on("close", () => {
		clearInterval(heartbeat);
		unsubscribe();
	});
}
async function readJsonBody(req) {
	const chunks = [];
	for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	const raw = Buffer.concat(chunks).toString("utf8");
	if (!raw.trim()) return void 0;
	return JSON.parse(raw);
}
async function serveStatic(req, res, staticDir, pathname) {
	writeCors(res);
	const safePath = pathname === "/" ? "/index.html" : pathname;
	const filePath = node_path.default.join(staticDir, safePath);
	if (!filePath.startsWith(staticDir)) {
		res.writeHead(403).end("Forbidden");
		return;
	}
	try {
		if ((await node_fs_promises.default.stat(filePath)).isDirectory()) {
			await sendFile(res, node_path.default.join(filePath, "index.html"));
			return;
		}
		await sendFile(res, filePath);
	} catch {
		try {
			await sendFile(res, node_path.default.join(staticDir, "index.html"));
		} catch {
			res.writeHead(404).end("Not found");
		}
	}
}
async function sendFile(res, filePath) {
	const data = await node_fs_promises.default.readFile(filePath);
	const ext = node_path.default.extname(filePath);
	res.writeHead(200, { "Content-Type": MIME[ext] ?? "application/octet-stream" });
	res.end(data);
}
function startServer(options) {
	const server = createServer(options);
	server.listen(options.port, options.host, () => {
		const hostLabel = options.host === "0.0.0.0" ? "localhost" : options.host;
		console.log(`[komorebi] web server listening on http://${hostLabel}:${options.port}`);
		if (options.host === "0.0.0.0") console.log("[komorebi] reachable on your LAN — open this URL on your phone");
		if (options.apiToken) console.log("[komorebi] API token required (Authorization: Bearer …)");
	});
	return server;
}

//#endregion
//#region src/server/main.ts
loadEnv();
const port = Number(process.env.KOMOREBI_PORT ?? 3847);
const host = process.env.KOMOREBI_HOST ?? "0.0.0.0";
const apiToken = process.env.KOMOREBI_API_TOKEN?.trim() || void 0;
const moduleDir = typeof __dirname === "string" ? __dirname : node_path.default.dirname((0, node_url.fileURLToPath)(require("url").pathToFileURL(__filename).href));
startServer({
	port,
	host,
	staticDir: node_path.default.join(moduleDir, "..", "..", "dist", "renderer"),
	apiToken
});

//#endregion
//# sourceMappingURL=main.cjs.map