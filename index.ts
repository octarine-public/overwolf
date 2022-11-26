import { PathX } from "github.com/octarine-private/immortal-core/index"
import { ArrayExtensions, BitsExtensions, Color, DOTA_GameMode, Events, EventsSDK, Input, InputEventSDK, LaneSelectionFlags_t, Menu, Rectangle, RendererSDK, SOType, UnitData, Vector2, VMouseKeys } from "github.com/octarine-public/wrapper/index"
import "./Translate"

interface MatchData {
	assists: number
	deaths: number
	duration: number
	hero_id: number
	kills: number
	match_id: number
	timestamp: number
	win: boolean
}

interface OutcomesData {
	match_count: number
	outcomes: number
}

interface MatchesData {
	wins: number
	losses: number
}

interface UserData {
	first_match_timestamp: Nullable<number>
	last_match: Nullable<MatchData>
	plus_prediction_streak: Nullable<number>
	prediction_streak: Nullable<number>
	recent_commends: Nullable<{
		commends: number
		match_count: number,
	}>
	recent_mvps: OutcomesData
	recent_outcomes: OutcomesData
	total_record: MatchesData
}

interface HeroData {
	last_match: Nullable<MatchData>
	recent_outcomes: OutcomesData
	total_record: Nullable<MatchesData>
}

interface PlayerData {
	user_data: UserData
	hero_data: HeroData
}

const current_players_cache = new Map<bigint, [Nullable<UserData>, Map<string, Nullable<HeroData>>]>()
function requestPlayerDataIfEnabled(steamid64: bigint): void {
	if (!state.value)
		return
	let ar = current_players_cache.get(steamid64)
	if (ar === undefined) {
		ar = [undefined, new Map()]
		current_players_cache.set(steamid64, ar)
	} else if (ar[1].size !== 0)
		return
	const unit_storage = UnitData.global_storage,
		player_id = Number(steamid64 - 76561197960265728n)
	for (const [unit_name, unit_data] of unit_storage) {
		if (unit_data.HeroID === 0)
			continue
		ar[1].set(unit_name, undefined)
		requestPlayerData(player_id, unit_data.HeroID).then(json => {
			const data = JSON.parse(json) as PlayerData
			ar![0] = data.user_data
			ar![1].set(unit_name, data.hero_data)
		})
	}
}

let current_lobby: Nullable<RecursiveMap>
let current_names: string[] = []
let current_roles: Nullable<LaneSelectionFlags_t>[] = []
let current_lobby_members: RecursiveMap[]
let send_ping = false,
	panel_shown = false
const RootNode = Menu.AddEntry("Overwolf", "github.com/octarine-public/wrapper/scripts_files/menu/icons/info.svg")
const bind = RootNode.AddKeybind("Key", "Tilde")
bind.OnPressed(() => {
	if (current_players_cache.size !== 0)
		panel_shown = !panel_shown
})
bind.activates_in_menu = true
const state = RootNode.AddToggle("State", true)
// const dodge_games_by_default = RootNode.AddToggle("Dodge Games By Default", false)
let needs_accept = false
let accept_deadline = 0
// let game_dodged = false
// function DeclineGame(): void {
// 	needs_accept = false
// 	send_ping = false
// 	game_dodged = true
// }
function AcceptGame(): void {
	SendGCPingResponse()
	needs_accept = false
	send_ping = false
}
// let last_party: Nullable<CSODOTAParty>
let self_account_id: Nullable<bigint>
EventsSDK.on("SharedObjectChanged", (id, reason, obj) => {
	if (id === SOType.GameAccountClient)
		self_account_id = 76561197960265728n + BigInt(obj.get("account_id") as number)
	// if (id === 2003) {
	// 	const party = obj as CSODOTAParty
	// 	if (
	// 		game_dodged
	// 		&& last_party?.raw_started_matchmaking_time !== undefined
	// 		&& party.raw_started_matchmaking_time === undefined
	// 	) {
	// 		StartFindingMatch()
	// 		game_dodged = false
	// 	}
	// 	last_party = reason !== 2 ? party : undefined
	// }
	if (id !== SOType.Lobby)
		return
	if (reason === 2) {
		current_lobby = undefined
		current_players_cache.clear()
		current_lobby_members = []
		send_ping = false
		panel_shown = false
		current_names = []
		current_roles = []
		needs_accept = false
	}
	if (reason !== 0)
		return
	current_lobby_members = (obj.get("all_members") as RecursiveMap[])
		.filter(member => member.has("id") && (member.get("team") === 0 || member.get("team") === 1))
	if (current_lobby_members.length > 10)
		return
	current_roles = current_lobby_members.map(member => member.get("lane_selection_flags") as LaneSelectionFlags_t)
	needs_accept = true
	panel_shown = true
	accept_deadline = hrtime() + 5000
	current_lobby = obj
	current_lobby_members.forEach(member => {
		current_names.push(TransformName(member.get("name") as string))
		requestPlayerDataIfEnabled(member.get("id") as bigint)
	})
})

Events.on("GCPingResponse", () => {
	if (state.value && needs_accept) {
		send_ping = true
		return false
	}
	return true
})

interface GUIBaseData {
	rect: Rectangle
	content_rect: Rectangle
	actual_content_rect: Rectangle
}

const line_offset = 2
const line_height = 2
const line_color = new Color(28, 40, 60)
const background_color = new Color(12, 21, 38)
const border_color = new Color(92, 124, 176)
const player_separator_offset = 2
const player_separator_height = 2
const player_separator_color = new Color(28, 40, 60)
const player_height = 48
const content_offset = new Vector2(7, 4)
const close_button_size = new Vector2(24, 24)
const close_button_color = new Color(128, 0, 0)
const close_icon_button_color = new Color(236, 236, 236)
// close_button_size = biggest height in header, os we use it here
const actual_content_offset = new Vector2(0, close_button_size.x + line_offset * 2 + line_height)
const horizontal_separator_size = new Vector2(1, player_height + player_separator_offset * 2)
const role_size = new Vector2(25, 25)
const rank_size = new Vector2(player_height, player_height)
const separator_name_offset = new Vector2(160 + rank_size.x + role_size.x, -player_separator_offset)
const separator_total_matches_offset = separator_name_offset.Add(new Vector2(50, 0))
const separator_last_info_offset = separator_total_matches_offset.Add(new Vector2(50, 0))
const separator_last_commends_offset = separator_last_info_offset.Add(new Vector2(75, 0))
const heroes_per_section = 4
const hero_image_size = new Vector2(74, player_height + 1)
const separator_most_successful_heroes_offset = separator_last_commends_offset.Add(new Vector2((hero_image_size.x + 2) * heroes_per_section + 7, 0))
const separator_last_picked_heroes_offset = separator_most_successful_heroes_offset.Add(new Vector2((hero_image_size.x + 2) * heroes_per_section + 7, 0))
function GetGUIBaseData(): GUIBaseData {
	const window_size = RendererSDK.WindowSize
	const size = new Vector2(
		content_offset.x * 2 + actual_content_offset.x * 2 + separator_last_picked_heroes_offset.x, // separator_last_picked_heroes_offset = last column
		content_offset.y * 2 + actual_content_offset.y + (
			player_height
			+ player_separator_offset * 2
			+ player_separator_height
		) * (10 + 1), // 1 = separator between radiant and dire
	)
	const offset = window_size.Subtract(size).DivideScalarForThis(2)
	const rect = new Rectangle(offset, offset.Add(size))
	const content_rect = new Rectangle(offset.Add(content_offset), offset.Add(size).Subtract(content_offset))
	const actual_content_rect = new Rectangle(content_rect.pos1.Add(actual_content_offset), content_rect.pos2)

	return {
		rect,
		content_rect,
		actual_content_rect,
	}
}

function GetGUICloseButton(base_data: GUIBaseData): Rectangle {
	const pos = new Vector2(
		base_data.content_rect.pos2.x - close_button_size.x,
		base_data.content_rect.pos1.y,
	)
	return new Rectangle(pos, pos.Add(close_button_size))
}
const accept_button_color = Color.Green
function GetGUIAcceptButton(base_data: GUIBaseData): Rectangle {
	const accept_text_size = Vector2.FromVector3(RendererSDK.GetTextSize("ACCEPT"))
	const accept_button_size = accept_text_size.Clone().AddScalarX(8)
	const decline_text_size = Vector2.FromVector3(RendererSDK.GetTextSize("DODGE"))
	const decline_button_size = decline_text_size.Clone().AddScalarX(8)
	const pos = new Vector2(
		base_data.content_rect.pos2.x - close_button_size.x - accept_button_size.x - 5 - decline_button_size.x - 5 - 250,
		base_data.content_rect.pos1.y,
	)
	accept_button_size.y = (base_data.actual_content_rect.pos1.y - base_data.content_rect.pos1.y) - line_height - line_offset * 2
	return new Rectangle(pos, pos.Add(accept_button_size))
}
// const decline_button_color = Color.Red
// function GetGUIDeclineButton(base_data: GUIBaseData): Rectangle {
// 	const decline_text_size = Vector2.FromVector3(RendererSDK.GetTextSize("DODGE"))
// 	const decline_button_size = decline_text_size.Clone().AddScalarX(8)
// 	const pos = new Vector2(
// 		base_data.content_rect.pos2.x - close_button_size.x - accept_button_size.x - 5 - 250,
// 		base_data.content_rect.pos1.y,
// 	)
// 	decline_button_size.y = (base_data.actual_content_rect.pos1.y - base_data.content_rect.pos1.y) - line_height - line_offset * 2
// 	return new Rectangle(pos, pos.Add(decline_button_size))
// }
function GetGUIDeadlineTextPos(base_data: GUIBaseData): Vector2 {
	// return GetGUIDeclineButton(base_data).pos2.Clone().AddScalarX(6)
	return GetGUIAcceptButton(base_data).pos2.Clone().AddScalarX(6)
}
function GetDescriptionText(base_data: GUIBaseData): [Vector2, number] {
	const size = 18
	return [new Vector2(
		base_data.content_rect.pos1.x + 3,
		base_data.content_rect.pos1.y + size,
	), size]
}

interface OutcomesInfo {
	winstreak: number
	losestreak: number
	match_count: number
	winrate: number
	wins: number
	losses: number
}
function ExtractOutcomesInfo(data: OutcomesData): OutcomesInfo {
	const match_count = data.match_count
	let winstreak = 0,
		losestreak = 0,
		wins = 0,
		losses = 0
	for (let i = 0; i < match_count; i++) {
		const win = BitsExtensions.HasBit(data.outcomes, i)
		if (win && losses === 0)
			winstreak++
		if (!win && wins === 0)
			losestreak++
		if (win)
			wins++
		else
			losses++
	}
	const winrate = match_count !== 0 ? (wins / match_count * 100) : 0
	return {
		winstreak,
		losestreak,
		match_count,
		winrate,
		wins,
		losses,
	}
}

function GetPlayerRect(base_data: GUIBaseData, id: number): Rectangle {
	const width = base_data.actual_content_rect.Size.x
	const pos1 = base_data.actual_content_rect.pos1.Add(new Vector2(0, (player_height + player_separator_height + player_separator_offset * 2) * id))
	return new Rectangle(pos1, pos1.Add(new Vector2(width, player_height)))
}

function RenderRankTier(pos: Vector2, rank_tier: number): void {
	const images_pos = pos.Clone().SubtractScalarY(rank_size.y)
	const medal = rank_tier ? Math.floor(rank_tier / 10) : 0
	RendererSDK.Image(`panorama/images/rank_tier_icons/rank${medal}_psd.vtex_c`, images_pos, -1, rank_size)

	const tier = rank_tier % 10
	if (medal === 0 || medal === 7 || tier === 0) // don't show pips at uncalibrateds and immortals, or if tier is somehow 0
		return
	RendererSDK.Image(`panorama/images/rank_tier_icons/pip${tier}_psd.vtex_c`, images_pos, -1, rank_size)
}

function GetGameModeName(game_mode: DOTA_GameMode): string {
	switch (game_mode) {
		case DOTA_GameMode.DOTA_GAMEMODE_ALL_DRAFT:
		case DOTA_GameMode.DOTA_GAMEMODE_AP:
			return "All Pick"
		case DOTA_GameMode.DOTA_GAMEMODE_CM:
			return "Captains Mode"
		case DOTA_GameMode.DOTA_GAMEMODE_RD:
			return "Random Draft"
		case DOTA_GameMode.DOTA_GAMEMODE_SD:
			return "Single Draft"
		case DOTA_GameMode.DOTA_GAMEMODE_AR:
			return "All Random"
		case DOTA_GameMode.DOTA_GAMEMODE_HW:
			return "HW"
		case DOTA_GameMode.DOTA_GAMEMODE_REVERSE_CM:
			return "Reverse Captains Mode"
		case DOTA_GameMode.DOTA_GAMEMODE_XMAS:
			return "Frostivus"
		case DOTA_GameMode.DOTA_GAMEMODE_MO:
			return "Mid Only"
		case DOTA_GameMode.DOTA_GAMEMODE_LP:
			return "Low Priority"
		case DOTA_GameMode.DOTA_GAMEMODE_POOL1:
			return "New Player Mode"
		case DOTA_GameMode.DOTA_GAMEMODE_FH:
			return "FH"
		case DOTA_GameMode.DOTA_GAMEMODE_CUSTOM:
			return "Custom Game"
		case DOTA_GameMode.DOTA_GAMEMODE_CD:
			return "Captains Draft"
		case DOTA_GameMode.DOTA_GAMEMODE_BD:
			return "BD"
		case DOTA_GameMode.DOTA_GAMEMODE_ABILITY_DRAFT:
			return "Ability Draft"
		case DOTA_GameMode.DOTA_GAMEMODE_EVENT:
			return "Event"
		case DOTA_GameMode.DOTA_GAMEMODE_ARDM:
			return "All Random Deathmatch"
		case DOTA_GameMode.DOTA_GAMEMODE_1V1MID:
			return "1v1 Solo Mid"
		case DOTA_GameMode.DOTA_GAMEMODE_TURBO:
			return "Turbo"
		case DOTA_GameMode.DOTA_GAMEMODE_MUTATION:
			return "Mutation"
		default:
			return ""
	}
}

function GetLobbyDescription(lobby: RecursiveMap): string {
	let description = ""
	switch (lobby.get("lobby_type") as number) {
		case 1:
			description += "Lobby | "
			break
		case 7:
			description += "Ranked | "
			break
		case 9:
			description += "BattleCup | "
			break
		default:
			break
	}
	return description + GetGameModeName(
		lobby.get("game_mode") as DOTA_GameMode
		?? DOTA_GameMode.DOTA_GAMEMODE_AP,
	)
}

function TransformName(name: string): string {
	if (name.length <= 13)
		return name
	return name.slice(0, 12) + "…"
}

function GetWinRateColor(winrate: number): Color {
	if (winrate <= 25)
		return Color.Red
	if (winrate > 75)
		return Color.Green
	const winrate_rgb = Math.max(Math.min((winrate * 2 - 25 - Math.abs(winrate - 50) + Math.abs(winrate - 45)) / 100 * 255, 255), 0)
	return new Color(255 - winrate_rgb, winrate_rgb, 0)
}

function GetStreakDescription(outcomes: OutcomesInfo): string {
	if (outcomes.losestreak === 0)
		return `W ${outcomes.winstreak}`
	else
		return `L ${outcomes.losestreak}`
}

function GetStreakColor(outcomes: OutcomesInfo): Color {
	if (outcomes.losestreak === 0) {
		if (outcomes.winstreak === 0)
			return Color.Gray
		return Color.Green
	} else
		return Color.Red
}

function GetActualTotalRecord(hero_data: HeroData): MatchesData {
	const total_record = hero_data.total_record
	const outcomes = ExtractOutcomesInfo(hero_data.recent_outcomes)
	const outcomes_record: MatchesData = {
		wins: outcomes.wins,
		losses: outcomes.match_count - outcomes.wins,
	}
	if (total_record === undefined || (total_record.wins + total_record.losses < outcomes.match_count))
		return outcomes_record
	return total_record
}

function RenderTotalMatches(pos: Vector2, total_winrate: number, total_matches: number, font_size = 18): void {
	const total_matches_str = `${total_matches}`
	const total_matches_size = RendererSDK.GetTextSize(total_matches_str, RendererSDK.DefaultFontName, font_size)
	RendererSDK.Text(
		total_matches_str,
		pos.Clone().SubtractScalarX(total_matches_size.x / 2).SubtractScalarY(total_matches_size.y),
		Color.White,
		RendererSDK.DefaultFontName,
		font_size,
	)

	const total_winrate_str = `${Math.round(total_winrate)}%`
	const total_winrate_size = RendererSDK.GetTextSize(total_winrate_str)
	RendererSDK.Text(
		total_winrate_str,
		pos.Clone().SubtractScalarX(total_winrate_size.x / 2).AddScalarY(total_matches_size.y - total_winrate_size.y + 5),
		total_matches !== 0 ? GetWinRateColor(total_winrate) : Color.Gray,
		RendererSDK.DefaultFontName,
		font_size,
	)
}

function RenderHeroStats(rect: Rectangle, hero_data: HeroData, font_size = 16): void {
	const rect_size = rect.Size
	const base_pos = rect.pos2.Subtract(rect_size.DivideScalar(2))
	RendererSDK.FilledRect(rect.pos1, rect_size, Color.Black.SetA(128))
	{
		const outcomes_info = ExtractOutcomesInfo(hero_data.recent_outcomes)
		RenderTotalMatches(
			base_pos.Clone().AddScalarX(rect_size.x / 4),
			outcomes_info.winrate,
			outcomes_info.match_count,
			font_size,
		)
	}
	{
		const total_record = GetActualTotalRecord(hero_data)
		const match_count = total_record.wins + total_record.losses
		const winrate = match_count !== 0 ? total_record.wins / match_count * 100 : 0
		RenderTotalMatches(
			base_pos.Clone().SubtractScalarX(rect_size.x / 4),
			winrate,
			match_count,
			font_size,
		)
	}
}

const tooltip_border_size = new Vector2(1, 1),
	tooltip_font = RendererSDK.DefaultFontName,
	tooltip_font_size = 18
function ShowTooltip(rect: Rectangle, cursor: Vector2, tooltip: string): void {
	if (!rect.Contains(cursor))
		return

	const Addscalar = 5
	const SizeImage = new Vector2(18, 18)

	const tooltip_size = Vector2.FromVector3(RendererSDK.GetTextSize(tooltip, tooltip_font, tooltip_font_size))

	const TotalSize = tooltip_size.Clone()
		.AddForThis(tooltip_border_size)
		.AddScalarX(SizeImage.x + (Addscalar * 2))
		.AddScalarY(Addscalar)

	const Position = rect.pos1.Clone().SubtractScalarY(TotalSize.y)

	const window_size = RendererSDK.WindowSize
	Position.x = Math.min(Position.x, window_size.x - TotalSize.x)
	Position.y = Math.min(Position.y, window_size.y - TotalSize.y)
	RendererSDK.FilledRect(Position, TotalSize, background_color)
	RendererSDK.OutlinedRect(Position, TotalSize, 1, border_color)

	RendererSDK.Image(
		"panorama/images/status_icons/information_psd.vtex_c",
		Position.Clone().AddScalarX(2),
		-1,
		SizeImage,
		Color.RoyalBlue,
	)

	RendererSDK.Text(
		tooltip,
		Position
			.AddForThis(tooltip_border_size)
			.AddScalarX(SizeImage.x + Addscalar),
		Color.White,
		tooltip_font,
		tooltip_font_size,
	)
}

const party_colors: Color[] = [
	new Color(55, 117, 240),
	new Color(129, 242, 188),
	new Color(174, 13, 172),
	new Color(240, 236, 41),
	new Color(236, 110, 31),
	new Color(243, 140, 196),
	new Color(158, 177, 98),
	new Color(109, 213, 237),
	new Color(12, 197, 63),
	new Color(214, 132, 17),
]
const party_line_size = new Vector2(3, 1)
EventsSDK.on("Draw", () => {
	if (send_ping && accept_deadline < hrtime()) {
		// if (dodge_games_by_default.value)
		// 	DeclineGame()
		// else
		AcceptGame()
	}
	if (!state.value || current_lobby_members === undefined)
		return
	current_lobby_members.forEach((member, i) => requestPlayerDataIfEnabled(member.get("id") as bigint))
	if (!panel_shown || current_players_cache.size === 0)
		return

	const cursor = Input.CursorOnScreen
	const gui_base_data = GetGUIBaseData()
	RendererSDK.FilledRect(gui_base_data.rect.pos1, gui_base_data.rect.Size, background_color)
	RendererSDK.OutlinedRect(gui_base_data.rect.pos1, gui_base_data.rect.Size, 1, border_color)

	const [gui_desc_text_pos, gui_desc_text_size] = GetDescriptionText(gui_base_data)
	const desc_str = `Octarine | ${Menu.Localization.Localize("Overwolf")} | ${GetLobbyDescription(current_lobby!)}`
	RendererSDK.Text(
		desc_str,
		gui_desc_text_pos.SubtractScalarY(RendererSDK.GetTextSize(desc_str, RendererSDK.DefaultFontName, gui_desc_text_size).y),
		Color.White,
		RendererSDK.DefaultFontName,
		gui_desc_text_size,
	)

	{
		const gui_close_button = GetGUICloseButton(gui_base_data)
		RendererSDK.FilledRect(gui_close_button.pos1, gui_close_button.Size, close_button_color)
		RendererSDK.Image("panorama/images/control_icons/x_close_png.vtex_c", gui_close_button.pos1, -1, gui_close_button.Size, close_icon_button_color)
	}

	if (send_ping) {
		const accept_text_size = RendererSDK.GetTextSize("ACCEPT")

		const gui_accept_button = GetGUIAcceptButton(gui_base_data)
		RendererSDK.FilledRect(gui_accept_button.pos1, gui_accept_button.Size, accept_button_color)
		RendererSDK.Text("ACCEPT", new Vector2(gui_accept_button.pos1.x + gui_accept_button.Width / 2 - accept_text_size.x / 2, gui_accept_button.pos2.y - accept_text_size.y))

		// const gui_decline_button = GetGUIDeclineButton(gui_base_data)
		// RendererSDK.FilledRect(gui_decline_button.pos1, gui_decline_button.Size, decline_button_color)
		// RendererSDK.Text("DODGE", new Vector2(gui_decline_button.pos1.x + decline_button_size.x / 2 - decline_text_size.x / 2, gui_decline_button.pos2.y - decline_button_size.y / 2))

		const gui_deadline_text_pos = GetGUIDeadlineTextPos(gui_base_data)
		const deadline_text = `${Math.round((accept_deadline - hrtime()) / 1000 * 10) / 10}s left`
		const deadline_text_size = RendererSDK.GetTextSize(deadline_text)
		RendererSDK.Text(deadline_text, gui_deadline_text_pos.AddScalarX(deadline_text_size.x / 2).SubtractScalarY(deadline_text_size.y))
	}

	RendererSDK.FilledRect(
		gui_base_data.actual_content_rect.pos1.Subtract(new Vector2(0, line_height + line_offset)),
		new Vector2(gui_base_data.actual_content_rect.Size.x, line_height),
		line_color,
	)

	let latest_partyid = -1n
	let current_party_id = 0
	for (let i = 0, end = current_lobby_members.length; i < end; i++) {
		const member = current_lobby_members[i]
		if (i === 5) {
			const rect_ = GetPlayerRect(gui_base_data, i)
			RendererSDK.FilledRect(
				new Vector2(rect_.pos1.x, rect_.pos2.y + player_separator_offset),
				new Vector2(rect_.Size.x, player_separator_height),
				player_separator_color,
			)
		}
		const rect = GetPlayerRect(gui_base_data, i >= 5 ? i + 1 : i)

		if (latest_partyid === member.get("party_id")) {
			const prev_i = i - 1
			const prev_rect = GetPlayerRect(gui_base_data, prev_i >= 5 ? prev_i + 1 : prev_i)
			const x = rect.pos1.x - party_line_size.x
			const y1 = prev_rect.pos1.y + prev_rect.Size.y / 2
			const y2 = rect.pos1.y + rect.Size.y / 2
			const color = party_colors[current_party_id]
			RendererSDK.FilledRect(new Vector2(x, y1), party_line_size, color)
			RendererSDK.FilledRect(new Vector2(x, y2), party_line_size, color)
			RendererSDK.FilledRect(new Vector2(x, y1), new Vector2(1, y2 - y1), color)
		} else
			current_party_id++
		latest_partyid = member.get("party_id") as bigint

		let current_pos = new Vector2(rect.pos1.x, rect.pos2.y)
		{
			const rect_rank_and_name = new Rectangle(rect.pos1.Clone(), new Vector2(rect.pos1.x + separator_name_offset.x, rect.pos2.y))

			const role = current_roles[i]
			let role_path = ""
			switch (role) {
				case LaneSelectionFlags_t.HARD_SUPPORT:
					role_path = PathX.Images.hardsupport
					break
				case LaneSelectionFlags_t.MID_LANE:
					role_path = PathX.Images.midlane
					break
				case LaneSelectionFlags_t.OFF_LANE:
					role_path = PathX.Images.offlane
					break
				case LaneSelectionFlags_t.SAFE_LANE:
					role_path = PathX.Images.safelane
					break
				case LaneSelectionFlags_t.SOFT_SUPPORT:
					role_path = PathX.Images.softsupport
					break
				default:
					break
			}
			if (role_path !== "")
				RendererSDK.Image(
					role_path,
					current_pos.Clone()
						.SubtractScalarY(rect.Size.y)
						.AddScalarY((rect.Size.y - role_size.y) / 2),
					-1,
					role_size,
				)
			current_pos.AddScalarX(role_size.x)

			RenderRankTier(current_pos, member.get("rank_tier") as number)
			current_pos.AddScalarX(rank_size.x)

			const name = current_names[i]
			RendererSDK.Text(
				name,
				current_pos.Clone()
					.SubtractScalarY(rect.Size.y / 2)
					.SubtractScalarY(RendererSDK.GetTextSize(name).y / 2),
				member.get("id") === self_account_id
					? Color.Green
					: GetPlayerMuteFlags(member.get("id") as bigint) !== 0
						? Color.Red
						: Color.White,
			)

			current_pos = rect.pos1.Add(separator_name_offset)
			RendererSDK.FilledRect(current_pos, horizontal_separator_size, line_color)
			current_pos.AddScalarX(horizontal_separator_size.x)

			ShowTooltip(rect_rank_and_name, cursor, "Role, rank, name")
		}

		RendererSDK.FilledRect(
			new Vector2(rect.pos1.x, rect.pos2.y + player_separator_offset),
			new Vector2(rect.Size.x, player_separator_height),
			player_separator_color,
		)

		const data = current_players_cache.get(member.get("id") as bigint)
		if (data === undefined || data[0] === undefined)
			continue

		{
			const rect_total_matches = new Rectangle(current_pos, new Vector2(rect.pos1.x + separator_total_matches_offset.x, rect.pos2.y))

			const user_total_record = data[0].total_record
			const total_matches = user_total_record.wins + user_total_record.losses
			const total_winrate = total_matches !== 0 ? user_total_record.wins / total_matches * 100 : 0
			const total_matches_str = `${total_matches}`
			const total_matches_size = RendererSDK.GetTextSize(total_matches_str)
			const total_matches_pos = rect_total_matches.pos2.Subtract(rect_total_matches.Size.DivideScalar(2))
			RendererSDK.Text(
				total_matches_str,
				total_matches_pos.Clone().SubtractScalarX(total_matches_size.x / 2).SubtractScalarY(total_matches_size.y),
			)

			const total_winrate_str = `${Math.round(total_winrate)}%`
			const total_winrate_size = RendererSDK.GetTextSize(total_winrate_str)
			RendererSDK.Text(
				total_winrate_str,
				total_matches_pos.Clone().SubtractScalarX(total_winrate_size.x / 2).AddScalarY(total_matches_size.y - total_winrate_size.y + 5),
				total_matches !== 0 ? GetWinRateColor(total_winrate) : Color.Gray,
			)

			current_pos = rect.pos1.Add(separator_total_matches_offset)
			RendererSDK.FilledRect(current_pos, horizontal_separator_size, line_color)
			current_pos.AddScalarX(horizontal_separator_size.x)

			ShowTooltip(rect_total_matches, cursor, "Total matches (up), overall winrate (down)")
		}

		const user_recent_outcomes = ExtractOutcomesInfo(data[0].recent_outcomes)
		{
			const rect_last_info = new Rectangle(current_pos, new Vector2(rect.pos1.x + separator_last_info_offset.x, rect.pos2.y))

			const last_streak_str = GetStreakDescription(user_recent_outcomes)
			const last_streak_size = RendererSDK.GetTextSize(last_streak_str)
			const last_info_pos = rect_last_info.pos2.Subtract(rect_last_info.Size.DivideScalar(2))
			RendererSDK.Text(
				last_streak_str,
				last_info_pos.Clone().SubtractScalarX(last_streak_size.x / 2).SubtractScalarY(last_streak_size.y),
				GetStreakColor(user_recent_outcomes),
			)

			const last_winrate_str = `${Math.round(user_recent_outcomes.winrate)}%`
			const last_winrate_size = RendererSDK.GetTextSize(last_winrate_str)
			RendererSDK.Text(
				last_winrate_str,
				last_info_pos.Clone().SubtractScalarX(last_winrate_size.x / 2).AddScalarY(last_streak_size.y - last_winrate_size.y + 5),
				user_recent_outcomes.match_count !== 0 ? GetWinRateColor(user_recent_outcomes.winrate) : Color.Gray,
			)

			current_pos = rect.pos1.Add(separator_last_info_offset)
			RendererSDK.FilledRect(current_pos, horizontal_separator_size, line_color)
			current_pos.AddScalarX(horizontal_separator_size.x)

			ShowTooltip(rect_last_info, cursor, "Last streak (up), recent winrate (down)\nLast streak starts with either W or L which means it is Winstreak or Losestreak.")
		}

		{
			const rect_last_commends = new Rectangle(current_pos, new Vector2(rect.pos1.x + separator_last_commends_offset.x, rect.pos2.y))

			const last_commends_str = `${data[0].recent_commends?.commends ?? 0}`
			const last_commends_size = RendererSDK.GetTextSize(last_commends_str, RendererSDK.DefaultFontName, 32)
			const last_commends_pos = rect_last_commends.pos2
				.Subtract(rect_last_commends.Size.DivideScalar(2))
				.AddScalarY(last_commends_size.y / 2)
				.SubtractScalarX(last_commends_size.x / 2)
				.AddScalarX(12)
			RendererSDK.Image(
				"panorama/images/conduct/commend_star_png.vtex_c",
				last_commends_pos.Subtract(new Vector2(32, 32)).AddScalarY(5),
				-1,
				new Vector2(32, 32),
				Color.Green,
			)
			RendererSDK.Text(
				last_commends_str,
				last_commends_pos.SubtractScalarY(last_commends_size.y),
				Color.White,
				RendererSDK.DefaultFontName,
				32,
			)

			current_pos = rect.pos1.Add(separator_last_commends_offset)
			RendererSDK.FilledRect(current_pos, horizontal_separator_size, line_color)
			current_pos.AddScalarX(horizontal_separator_size.x)

			ShowTooltip(rect_last_commends, cursor, "Recent commends")
		}

		let loaded_all_heroes = data[1] !== undefined
		if (loaded_all_heroes)
			for (const [, hero_data] of data[1])
				if (hero_data === undefined) {
					loaded_all_heroes = false
					break
				}
		{
			const rect_most_successful_heroes = new Rectangle(current_pos.Clone(), new Vector2(rect.pos1.x + separator_most_successful_heroes_offset.x, rect.pos2.y))

			const sorted_heroes = loaded_all_heroes
				? ArrayExtensions.orderBy(
					[...data[1].entries()].filter(([, hero_data]) => hero_data!.last_match !== undefined),
					([, hero_data]) => -GetActualTotalRecord(hero_data!).wins,
				).slice(0, heroes_per_section)
				: []

			current_pos = current_pos.AddScalarX(3).AddScalarY(2)
			for (const [hero_name, hero_data] of sorted_heroes) {
				RendererSDK.Image(
					`panorama/images/heroes/${hero_name}_png.vtex_c`,
					current_pos,
					-1,
					hero_image_size,
				)
				RenderHeroStats(new Rectangle(current_pos, current_pos.Add(hero_image_size)), hero_data!)
				current_pos.AddScalarX(hero_image_size.x + 2)
			}

			current_pos = rect.pos1.Add(separator_most_successful_heroes_offset)
			RendererSDK.FilledRect(current_pos, horizontal_separator_size, line_color)
			current_pos.AddScalarX(horizontal_separator_size.x)

			ShowTooltip(rect_most_successful_heroes, cursor, "Most successful heroes\nInfo on left side - overall matches count, overall winrate.\nInfo on right side - last matches count (at most 20), last winrate.")
		}

		{
			const rect_last_picked_heroes = new Rectangle(current_pos.Clone(), new Vector2(rect.pos1.x + separator_last_picked_heroes_offset.x, rect.pos2.y))

			const sorted_heroes = loaded_all_heroes
				? ArrayExtensions.orderBy(
					[...data[1].entries()].filter(([, hero_data]) => hero_data!.last_match !== undefined),
					([, hero_data]) => -(hero_data?.last_match?.timestamp ?? 0),
				).slice(0, heroes_per_section)
				: []

			current_pos = current_pos.AddScalarX(3).AddScalarY(2)
			for (const [hero_name, hero_data] of sorted_heroes) {
				RendererSDK.Image(
					`panorama/images/heroes/${hero_name}_png.vtex_c`,
					current_pos,
					-1,
					hero_image_size,
				)
				RenderHeroStats(new Rectangle(current_pos, current_pos.Add(hero_image_size)), hero_data!)
				current_pos.AddScalarX(hero_image_size.x + 3)
			}

			current_pos = rect.pos1.Add(separator_last_picked_heroes_offset)
			RendererSDK.FilledRect(current_pos, horizontal_separator_size, line_color)
			current_pos.AddScalarX(horizontal_separator_size.x)

			ShowTooltip(rect_last_picked_heroes, cursor, "Recently picked heroes\nInfo on left side - overall matches count, overall winrate.\nInfo on right side - last matches count (at most 20), last winrate.")
		}
	}
})

InputEventSDK.on("MouseKeyDown", mask => {
	if (!state.value || !panel_shown || current_players_cache.size === 0)
		return true

	const cursor = Input.CursorOnScreen
	const gui_base_data = GetGUIBaseData()
	if (!gui_base_data.rect.Contains(cursor))
		return true

	if (mask === VMouseKeys.MK_LBUTTON) {
		if (GetGUICloseButton(gui_base_data).Contains(cursor)) {
			panel_shown = false
			return false
		}
		if (send_ping) {
			if (GetGUIAcceptButton(gui_base_data).Contains(cursor)) {
				AcceptGame()
				return false
			}
			// if (GetGUIDeclineButton(gui_base_data).Contains(cursor)) {
			// 	DeclineGame()
			// 	return false
			// }
		}
	}

	return false
})
