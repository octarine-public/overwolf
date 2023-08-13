import "./Translate"

import { PathX } from "github.com/octarine-private/immortal-core/index"
import {
	ArrayExtensions,
	BitsExtensions,
	Color,
	DOTAGameMode,
	Events,
	EventsSDK,
	Input,
	InputEventSDK,
	LaneSelectionFlags,
	Menu,
	Rectangle,
	RendererSDK,
	SOType,
	UnitData,
	Vector2,
	VMouseKeys,
} from "github.com/octarine-public/wrapper/index"

const currentPlayersCache = new Map<
	bigint,
	[Nullable<UserData>, Map<string, Nullable<HeroData>>]
>()
const activePromises: Promise<void>[] = []

function IsVlaidNameStorage(name: string, unitData: UnitData) {
	return (
		unitData.HeroID !== 0 
		&& name !== "npc_dota_hero_base" 
		&& name !== "npc_dota_hero_target_dummy" // ID 127
		&& name.startsWith("npc_dota_hero_")
	)
}

function StorageNames() {
	return [...UnitData.globalStorage.entries()].filter(([name, data]) => IsVlaidNameStorage(name, data))
}

function requestPlayerDataIfEnabled(steamid64: bigint): void {
	if (!state.value) return
	let ar = currentPlayersCache.get(steamid64)
	if (ar === undefined) {
		ar = [undefined, new Map()]
		currentPlayersCache.set(steamid64, ar)
	} else if (ar[1].size !== 0) return

	const playerID = Number(steamid64 - 76561197960265728n)

	for (const [unitName, unitData] of StorageNames()) {
		ar[1].set(unitName, undefined)
		const prom = requestPlayerData(playerID, unitData.HeroID).then(json => {
			const data = JSON.parse(json) as PlayerData
			ar![0] = data.user_data
			ar![1].set(unitName, data.hero_data)
			ArrayExtensions.arrayRemove(activePromises, prom)
		})
		activePromises.push(prom)
	}
}

let currentLobby: Nullable<RecursiveMap>
let currentNames: string[] = []
let currentRoles: Nullable<LaneSelectionFlags>[] = []
let currentLobbyMembers: RecursiveMap[]
let sendPing = false,
	panelShown = false
const RootNode = Menu.AddEntry(
	"Overwolf",
	"github.com/octarine-public/wrapper/scripts_files/menu/icons/info.svg"
)
RootNode.SortNodes = false

const state = RootNode.AddToggle("State", true)
const bind = RootNode.AddKeybind("Key", "Tilde", "Show/Hide menu")
const reload = RootNode.AddKeybind("Reload stats", "", "Reload players stats")

reload.OnRelease(() => RealodGUIData())
bind.OnPressed(() => {
	if (currentPlayersCache.size !== 0) panelShown = !panelShown
})
bind.ActivatesInMenu = true

// const dodge_games_by_default = RootNode.AddToggle("Dodge Games By Default", false)
let needsAccept = false
let acceptDeadline = 0
// let game_dodged = false
// function DeclineGame(): void {
// 	needsAccept = false
// 	send_ping = false
// 	game_dodged = true
// }
function AcceptGame(): void {
	SendGCPingResponse()
	needsAccept = false
	sendPing = false
}
// let last_party: Nullable<CSODOTAParty>
let selfAccountID: Nullable<bigint>
EventsSDK.on("SharedObjectChanged", (id, reason, obj) => {
	if (id === SOType.GameAccountClient)
		selfAccountID =
			76561197960265728n + BigInt(obj.get("account_id") as number)
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
	if (id !== SOType.Lobby) return

	if (reason === 2) {
		currentLobby = undefined
		currentPlayersCache.clear()
		currentLobbyMembers = []
		sendPing = false
		panelShown = false
		currentNames = []
		currentRoles = []
		needsAccept = false
	}

	if (reason !== 0) return

	currentLobbyMembers = (obj.get("all_members") as RecursiveMap[]).filter(
		member =>
			member.has("id") &&
			(member.get("team") === 0 || member.get("team") === 1)
	)

	if (currentLobbyMembers.length > 10) return

	currentRoles = currentLobbyMembers.map(
		member => member.get("lane_selection_flags") as LaneSelectionFlags
	)

	needsAccept = true
	panelShown = true
	acceptDeadline = hrtime() + 5000
	currentLobby = obj
	
	console.log("Loading overwolf data...") // idk ths console (fix load heroes)

	for (const member of currentLobbyMembers) {
		currentNames.push(TransformName(member.get("name") as string))
		requestPlayerDataIfEnabled(member.get("id") as bigint)
	}
})

Events.on("GCPingResponse", () => {
	if (state.value && needsAccept) {
		sendPing = true
		return false
	}
	return true
})


interface GUIBaseData {
	rect: Rectangle
	contentRect: Rectangle
	actualContentRect: Rectangle
}

const lineOffset = 2
const lineHeight = 2
const lineColor = new Color(28, 40, 60)
const backgroundColor = new Color(12, 21, 38)
const borderColor = new Color(92, 124, 176)
const playerSeparatorOffset = 2
const playerSeparatorHeight = 2
const playerSeparatorColor = new Color(28, 40, 60)
const playerHeight = 48
const contentOffset = new Vector2(7, 4)
const closeButtonSize = new Vector2(24, 24)
const closeButtonColor = new Color(128, 0, 0)
const closeIconButtonColor = new Color(236, 236, 236)
// closeButtonSize = biggest height in header, os we use it here
const actualContentOffset = new Vector2(
	0,
	closeButtonSize.x + lineOffset * 2 + lineHeight
)
const horizontalSeparatorSize = new Vector2(
	1,
	playerHeight + playerSeparatorOffset * 2
)
const roleSize = new Vector2(25, 25)
const rankSize = new Vector2(playerHeight, playerHeight)
const separatorNameOffset = new Vector2(
	160 + rankSize.x + roleSize.x,
	-playerSeparatorOffset
)
const separatorTotalMatchesOffset = separatorNameOffset.Add(new Vector2(50, 0))
const separatorLastInfoOffset = separatorTotalMatchesOffset.Add(
	new Vector2(50, 0)
)
const separatorLastCommendsOffset = separatorLastInfoOffset.Add(
	new Vector2(75, 0)
)
const heroesPerSection = 4
const heroImageSize = new Vector2(74, playerHeight + 1)
const separatorMostSuccessfulHeroesOffset = separatorLastCommendsOffset.Add(
	new Vector2((heroImageSize.x + 2) * heroesPerSection + 7, 0)
)
const separatorLastPickedHeroesOffset = separatorMostSuccessfulHeroesOffset.Add(
	new Vector2((heroImageSize.x + 2) * heroesPerSection + 7, 0)
)

function RealodGUIData() {
	if (currentLobby !== undefined && selfAccountID !== undefined) {
		currentPlayersCache.clear()
		requestPlayerDataIfEnabled(selfAccountID)
		console.log("Reload overwolf data...")
	}
}

function GetGUIBaseData(): GUIBaseData {
	const windowSize = RendererSDK.WindowSize
	const size = new Vector2(
		contentOffset.x * 2 +
			actualContentOffset.x * 2 +
			separatorLastPickedHeroesOffset.x, // separatorLastPickedHeroesOffset = last column
		contentOffset.y * 2 +
			actualContentOffset.y +
			(playerHeight + playerSeparatorOffset * 2 + playerSeparatorHeight) *
				(10 + 1) // 1 = separator between radiant and dire
	)
	const offset = windowSize.Subtract(size).DivideScalarForThis(2)
	const rect = new Rectangle(offset, offset.Add(size))
	const contentRect = new Rectangle(
		offset.Add(contentOffset),
		offset.Add(size).Subtract(contentOffset)
	)
	const actualContentRect = new Rectangle(
		contentRect.pos1.Add(actualContentOffset),
		contentRect.pos2
	)

	return {
		rect,
		contentRect,
		actualContentRect,
	}
}

function GetGUICloseButton(baseData: GUIBaseData): Rectangle {
	const pos = new Vector2(
		baseData.contentRect.pos2.x - closeButtonSize.x,
		baseData.contentRect.pos1.y
	)
	return new Rectangle(pos, pos.Add(closeButtonSize))
}
function GetGUIReloadButton(baseData: GUIBaseData) {
	const pos = new Vector2(
		baseData.contentRect.pos2.x - closeButtonSize.x * 2.25,
		baseData.contentRect.pos1.y
	)
	return new Rectangle(pos, pos.Add(closeButtonSize))
}

const acceptButtonColor = Color.Green
function GetGUIAcceptButton(baseData: GUIBaseData): Rectangle {
	const acceptTextSize = Vector2.FromVector3(
		RendererSDK.GetTextSize("ACCEPT")
	)
	const acceptButtonSize = acceptTextSize.Clone().AddScalarX(8)
	const declineTextSize = Vector2.FromVector3(
		RendererSDK.GetTextSize("DODGE")
	)
	const declineButtonSize = declineTextSize.Clone().AddScalarX(8)
	const pos = new Vector2(
		baseData.contentRect.pos2.x -
			closeButtonSize.x -
			acceptButtonSize.x -
			5 -
			declineButtonSize.x -
			5 -
			250,
		baseData.contentRect.pos1.y
	)
	acceptButtonSize.y =
		baseData.actualContentRect.pos1.y -
		baseData.contentRect.pos1.y -
		lineHeight -
		lineOffset * 2
	return new Rectangle(pos, pos.Add(acceptButtonSize))
}
// const declineButtonColor = Color.Red
// function GetGUIDeclineButton(baseData: GUIBaseData): Rectangle {
// 	const declineTextSize = Vector2.FromVector3(RendererSDK.GetTextSize("DODGE"))
// 	const declineButtonSize = declineTextSize.Clone().AddScalarX(8)
// 	const pos = new Vector2(
// 		baseData.contentRect.pos2.x - closeButtonSize.x - acceptButtonSize.x - 5 - 250,
// 		baseData.contentRect.pos1.y,
// 	)
// 	declineButtonSize.y = (baseData.actual_contentRect.pos1.y - baseData.contentRect.pos1.y) - lineHeight - lineOffset * 2
// 	return new Rectangle(pos, pos.Add(declineButtonSize))
// }
function GetGUIDeadlineTextPos(baseData: GUIBaseData): Vector2 {
	// return GetGUIDeclineButton(baseData).pos2.Clone().AddScalarX(6)
	return GetGUIAcceptButton(baseData).pos2.Clone().AddScalarX(6)
}
function GetDescriptionText(baseData: GUIBaseData): [Vector2, number] {
	const size = 18
	return [
		new Vector2(
			baseData.contentRect.pos1.x + 3,
			baseData.contentRect.pos1.y + size
		),
		size,
	]
}

interface OutcomesInfo {
	winstreak: number
	losestreak: number
	matchCount: number
	winrate: number
	wins: number
	losses: number
}
function ExtractOutcomesInfo(data: OutcomesData): OutcomesInfo {
	const matchCount = data.match_count
	let winstreak = 0,
		losestreak = 0,
		wins = 0,
		losses = 0
	for (let i = 0; i < matchCount; i++) {
		const win = BitsExtensions.HasBit(data.outcomes, i)
		if (win && losses === 0) winstreak++
		if (!win && wins === 0) losestreak++
		if (win) wins++
		else losses++
	}
	const winrate = matchCount !== 0 ? (wins / matchCount) * 100 : 0
	return {
		winstreak,
		losestreak,
		matchCount,
		winrate,
		wins,
		losses,
	}
}

function GetPlayerRect(baseData: GUIBaseData, id: number): Rectangle {
	const width = baseData.actualContentRect.Size.x
	const pos1 = baseData.actualContentRect.pos1.Add(
		new Vector2(
			0,
			(playerHeight + playerSeparatorHeight + playerSeparatorOffset * 2) *
				id
		)
	)
	return new Rectangle(pos1, pos1.Add(new Vector2(width, playerHeight)))
}

function RenderRankTier(pos: Vector2, rankTier: number): void {
	const imagesPos = pos.Clone().SubtractScalarY(rankSize.y)
	const medal = rankTier ? Math.floor(rankTier / 10) : 0
	RendererSDK.Image(
		`panorama/images/rank_tier_icons/rank${medal}_psd.vtex_c`,
		imagesPos,
		-1,
		rankSize
	)

	const tier = rankTier % 10
	if (medal === 0 || medal === 7 || tier === 0)
		// don't show pips at uncalibrateds and immortals, or if tier is somehow 0
		return
	RendererSDK.Image(
		`panorama/images/rank_tier_icons/pip${tier}_psd.vtex_c`,
		imagesPos,
		-1,
		rankSize
	)
}

function GetGameModeName(gameMode: DOTAGameMode): string {
	switch (gameMode) {
		case DOTAGameMode.DOTA_GAMEMODE_ALL_DRAFT:
		case DOTAGameMode.DOTA_GAMEMODE_AP:
			return "All Pick"
		case DOTAGameMode.DOTA_GAMEMODE_CM:
			return "Captains Mode"
		case DOTAGameMode.DOTA_GAMEMODE_RD:
			return "Random Draft"
		case DOTAGameMode.DOTA_GAMEMODE_SD:
			return "Single Draft"
		case DOTAGameMode.DOTA_GAMEMODE_AR:
			return "All Random"
		case DOTAGameMode.DOTA_GAMEMODE_HW:
			return "HW"
		case DOTAGameMode.DOTA_GAMEMODE_REVERSE_CM:
			return "Reverse Captains Mode"
		case DOTAGameMode.DOTA_GAMEMODE_XMAS:
			return "Frostivus"
		case DOTAGameMode.DOTA_GAMEMODE_MO:
			return "Mid Only"
		case DOTAGameMode.DOTA_GAMEMODE_LP:
			return "Low Priority"
		case DOTAGameMode.DOTA_GAMEMODE_POOL1:
			return "New Player Mode"
		case DOTAGameMode.DOTA_GAMEMODE_FH:
			return "FH"
		case DOTAGameMode.DOTA_GAMEMODE_CUSTOM:
			return "Custom Game"
		case DOTAGameMode.DOTA_GAMEMODE_CD:
			return "Captains Draft"
		case DOTAGameMode.DOTA_GAMEMODE_BD:
			return "BD"
		case DOTAGameMode.DOTA_GAMEMODE_ABILITY_DRAFT:
			return "Ability Draft"
		case DOTAGameMode.DOTA_GAMEMODE_EVENT:
			return "Event"
		case DOTAGameMode.DOTA_GAMEMODE_ARDM:
			return "All Random Deathmatch"
		case DOTAGameMode.DOTA_GAMEMODE_1V1MID:
			return "1v1 Solo Mid"
		case DOTAGameMode.DOTA_GAMEMODE_TURBO:
			return "Turbo"
		case DOTAGameMode.DOTA_GAMEMODE_MUTATION:
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
	return (
		description +
		GetGameModeName(
			(lobby.get("game_mode") as DOTAGameMode) ??
				DOTAGameMode.DOTA_GAMEMODE_AP
		)
	)
}

function TransformName(name: string): string {
	if (name.length <= 13) return name
	return name.slice(0, 12) + "…"
}

function GetWinRateColor(winrate: number): Color {
	if (winrate <= 25) return Color.Red
	if (winrate > 75) return Color.Green
	const winrateRGB = Math.max(
		Math.min(
			((winrate * 2 -
				25 -
				Math.abs(winrate - 50) +
				Math.abs(winrate - 45)) /
				100) *
				255,
			255
		),
		0
	)
	return new Color(255 - winrateRGB, winrateRGB, 0)
}

function GetStreakDescription(outcomes: OutcomesInfo): string {
	if (outcomes.losestreak === 0) return `W ${outcomes.winstreak}`
	return `L ${outcomes.losestreak}`
}

function GetStreakColor(outcomes: OutcomesInfo): Color {
	if (outcomes.losestreak === 0) {
		if (outcomes.winstreak === 0) return Color.Gray
		return Color.Green
	}
	return Color.Red
}

function GetActualTotalRecord(heroData: HeroData): MatchesData {
	const totalRecord = heroData.total_record
	const outcomes = ExtractOutcomesInfo(heroData.recent_outcomes)
	const outcomesRecord: MatchesData = {
		wins: outcomes.wins,
		losses: outcomes.matchCount - outcomes.wins,
	}
	if (
		totalRecord === undefined ||
		totalRecord.wins + totalRecord.losses < outcomes.matchCount
	)
		return outcomesRecord
	return totalRecord
}

function RenderTotalMatches(
	pos: Vector2,
	totalWinrate: number,
	totalMatches: number,
	fontSize = 18
): void {
	const totalMatchesSrt = `${totalMatches}`
	const totalMatchesSize = RendererSDK.GetTextSize(
		totalMatchesSrt,
		RendererSDK.DefaultFontName,
		fontSize
	)
	RendererSDK.Text(
		totalMatchesSrt,
		pos
			.Clone()
			.SubtractScalarX(totalMatchesSize.x / 2)
			.SubtractScalarY(totalMatchesSize.y),
		Color.White,
		RendererSDK.DefaultFontName,
		fontSize
	)

	const totalWinrateSrt = `${Math.round(totalWinrate)}%`
	const totalWinrateSize = RendererSDK.GetTextSize(totalWinrateSrt)
	RendererSDK.Text(
		totalWinrateSrt,
		pos
			.Clone()
			.SubtractScalarX(totalWinrateSize.x / 2)
			.AddScalarY(totalMatchesSize.y - totalWinrateSize.y + 5),
		totalMatches !== 0 ? GetWinRateColor(totalWinrate) : Color.Gray,
		RendererSDK.DefaultFontName,
		fontSize
	)
}

function RenderHeroStats(
	rect: Rectangle,
	heroData: HeroData,
	fontSize = 16
): void {
	const rectSize = rect.Size
	const basePos = rect.pos2.Subtract(rectSize.DivideScalar(2))
	RendererSDK.FilledRect(rect.pos1, rectSize, Color.Black.SetA(128))
	{
		const outcomesInfo = ExtractOutcomesInfo(heroData.recent_outcomes)
		RenderTotalMatches(
			basePos.Clone().AddScalarX(rectSize.x / 4),
			outcomesInfo.winrate,
			outcomesInfo.matchCount,
			fontSize
		)
	}
	{
		const totalRecord = GetActualTotalRecord(heroData)
		const matchCount = totalRecord.wins + totalRecord.losses
		const winrate =
			matchCount !== 0 ? (totalRecord.wins / matchCount) * 100 : 0
		RenderTotalMatches(
			basePos.Clone().SubtractScalarX(rectSize.x / 4),
			winrate,
			matchCount,
			fontSize
		)
	}
}

const tooltipBorderSize = new Vector2(1, 1),
	tooltipFont = RendererSDK.DefaultFontName,
	tooltipFontSize = 18
function ShowTooltip(rect: Rectangle, cursor: Vector2, tooltip: string): void {
	if (!rect.Contains(cursor)) return

	const Addscalar = 5
	const SizeImage = new Vector2(18, 18)

	const tooltipSize = Vector2.FromVector3(
		RendererSDK.GetTextSize(tooltip, tooltipFont, tooltipFontSize)
	)

	const TotalSize = tooltipSize
		.Clone()
		.AddForThis(tooltipBorderSize)
		.AddScalarX(SizeImage.x + Addscalar * 2)
		.AddScalarY(Addscalar)

	const Position = rect.pos1.Clone().SubtractScalarY(TotalSize.y)

	const windowSize = RendererSDK.WindowSize
	Position.x = Math.min(Position.x, windowSize.x - TotalSize.x)
	Position.y = Math.min(Position.y, windowSize.y - TotalSize.y)
	RendererSDK.FilledRect(Position, TotalSize, backgroundColor)
	RendererSDK.OutlinedRect(Position, TotalSize, 1, borderColor)

	RendererSDK.Image(
		"panorama/images/status_icons/information_psd.vtex_c",
		Position.Clone().AddScalarX(2),
		-1,
		SizeImage,
		Color.RoyalBlue
	)

	RendererSDK.Text(
		tooltip,
		Position.AddForThis(tooltipBorderSize).AddScalarX(
			SizeImage.x + Addscalar
		),
		Color.White,
		tooltipFont,
		tooltipFontSize
	)
}

const partyColors: Color[] = [
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
const partyLineSize = new Vector2(3, 1)
EventsSDK.on("Draw", () => {
	if (sendPing && acceptDeadline < hrtime()) {
		// if (dodge_games_by_default.value)
		// 	DeclineGame()
		// else
		AcceptGame()
	}
	if (!state.value || currentLobbyMembers === undefined) return
	for (const member of currentLobbyMembers)
		requestPlayerDataIfEnabled(member.get("id") as bigint)
	if (!panelShown || currentPlayersCache.size === 0) return

	const cursor = Input.CursorOnScreen
	const guiBaseData = GetGUIBaseData()
	RendererSDK.FilledRect(
		guiBaseData.rect.pos1,
		guiBaseData.rect.Size,
		backgroundColor
	)
	RendererSDK.OutlinedRect(
		guiBaseData.rect.pos1,
		guiBaseData.rect.Size,
		1,
		borderColor
	)

	const [guiDescTextPos, guiDescTextSize] = GetDescriptionText(guiBaseData)
	const descSrt = `Octarine | ${Menu.Localization.Localize(
		"Overwolf"
	)} | ${GetLobbyDescription(currentLobby!)}`
	RendererSDK.Text(
		descSrt,
		guiDescTextPos.SubtractScalarY(
			RendererSDK.GetTextSize(
				descSrt,
				RendererSDK.DefaultFontName,
				guiDescTextSize
			).y
		),
		Color.White,
		RendererSDK.DefaultFontName,
		guiDescTextSize
	)

	{
		const guiCloseButton = GetGUICloseButton(guiBaseData)
		RendererSDK.FilledRect(
			guiCloseButton.pos1,
			guiCloseButton.Size,
			closeButtonColor
		)

		RendererSDK.Image(
			"panorama/images/control_icons/x_close_png.vtex_c",
			guiCloseButton.pos1,
			-1,
			guiCloseButton.Size,
			closeIconButtonColor
		)

		const guiReloadButton = GetGUIReloadButton(guiBaseData)
		RendererSDK.FilledRect(
			guiReloadButton.pos1,
			guiReloadButton.Size,
			Color.Black.SetA(180)
		)

		RendererSDK.Image(
			"panorama/images/hud/reborn/icon_courier_inuse_psd.vtex_c",
			guiReloadButton.pos1,
			-1,
			guiReloadButton.Size,
			closeIconButtonColor
		)
	}

	if (sendPing) {
		const acceptTextSize = RendererSDK.GetTextSize("ACCEPT")

		const guiAcceptButton = GetGUIAcceptButton(guiBaseData)
		RendererSDK.FilledRect(
			guiAcceptButton.pos1,
			guiAcceptButton.Size,
			acceptButtonColor
		)
		RendererSDK.Text(
			"ACCEPT",
			new Vector2(
				guiAcceptButton.pos1.x +
					guiAcceptButton.Width / 2 -
					acceptTextSize.x / 2,
				guiAcceptButton.pos2.y - acceptTextSize.y
			)
		)

		// const gui_declineButton = GetGUIDeclineButton(guiBaseData)
		// RendererSDK.FilledRect(gui_declineButton.pos1, gui_declineButton.Size, declineButtonColor)
		// RendererSDK.Text("DODGE", new Vector2(gui_declineButton.pos1.x + declineButtonSize.x / 2 - declineTextSize.x / 2, gui_declineButton.pos2.y - declineButtonSize.y / 2))

		const guiDeadlineTextPos = GetGUIDeadlineTextPos(guiBaseData)
		const deadlineText = `${
			Math.round(((acceptDeadline - hrtime()) / 1000) * 10) / 10
		}s left`
		const deadlineTextSize = RendererSDK.GetTextSize(deadlineText)
		RendererSDK.Text(
			deadlineText,
			guiDeadlineTextPos
				.AddScalarX(deadlineTextSize.x / 2)
				.SubtractScalarY(deadlineTextSize.y)
		)
	}

	RendererSDK.FilledRect(
		guiBaseData.actualContentRect.pos1.Subtract(
			new Vector2(0, lineHeight + lineOffset)
		),
		new Vector2(guiBaseData.actualContentRect.Size.x, lineHeight),
		lineColor
	)

	let latestPartyID = -1n
	let currentPartyID = 0
	for (let i = 0, end = currentLobbyMembers.length; i < end; i++) {
		const member = currentLobbyMembers[i]
		if (i === 5) {
			const playerRect = GetPlayerRect(guiBaseData, i)
			RendererSDK.FilledRect(
				new Vector2(
					playerRect.pos1.x,
					playerRect.pos2.y + playerSeparatorOffset
				),
				new Vector2(playerRect.Size.x, playerSeparatorHeight),
				playerSeparatorColor
			)
		}
		const rect = GetPlayerRect(guiBaseData, i >= 5 ? i + 1 : i)

		if (latestPartyID === member.get("party_id")) {
			const prevI = i - 1
			const prevRect = GetPlayerRect(
				guiBaseData,
				prevI >= 5 ? prevI + 1 : prevI
			)
			const x = rect.pos1.x - partyLineSize.x
			const y1 = prevRect.pos1.y + prevRect.Size.y / 2
			const y2 = rect.pos1.y + rect.Size.y / 2
			const color = partyColors[currentPartyID]
			RendererSDK.FilledRect(new Vector2(x, y1), partyLineSize, color)
			RendererSDK.FilledRect(new Vector2(x, y2), partyLineSize, color)
			RendererSDK.FilledRect(
				new Vector2(x, y1),
				new Vector2(1, y2 - y1),
				color
			)
		} else currentPartyID++
		latestPartyID = member.get("party_id") as bigint

		let currentPos = new Vector2(rect.pos1.x, rect.pos2.y)
		{
			const rectRankAndName = new Rectangle(
				rect.pos1.Clone(),
				new Vector2(rect.pos1.x + separatorNameOffset.x, rect.pos2.y)
			)

			const role = currentRoles[i]
			let rolePath = ""
			switch (role) {
				case LaneSelectionFlags.HARD_SUPPORT:
					rolePath = PathX.Images.hardsupport
					break
				case LaneSelectionFlags.MID_LANE:
					rolePath = PathX.Images.midlane
					break
				case LaneSelectionFlags.OFF_LANE:
					rolePath = PathX.Images.offlane
					break
				case LaneSelectionFlags.SAFE_LANE:
					rolePath = PathX.Images.safelane
					break
				case LaneSelectionFlags.SOFT_SUPPORT:
					rolePath = PathX.Images.softsupport
					break
				default:
					break
			}
			if (rolePath !== "")
				RendererSDK.Image(
					rolePath,
					currentPos
						.Clone()
						.SubtractScalarY(rect.Size.y)
						.AddScalarY((rect.Size.y - roleSize.y) / 2),
					-1,
					roleSize
				)
			currentPos.AddScalarX(roleSize.x)

			RenderRankTier(currentPos, member.get("rank_tier") as number)
			currentPos.AddScalarX(rankSize.x)

			const name = currentNames[i]
			RendererSDK.Text(
				name,
				currentPos
					.Clone()
					.SubtractScalarY(rect.Size.y / 2)
					.SubtractScalarY(RendererSDK.GetTextSize(name).y / 2),
				member.get("id") === selfAccountID
					? Color.Green
					: GetPlayerMuteFlags(member.get("id") as bigint) !== 0
					? Color.Red
					: Color.White
			)

			currentPos = rect.pos1.Add(separatorNameOffset)
			RendererSDK.FilledRect(
				currentPos,
				horizontalSeparatorSize,
				lineColor
			)
			currentPos.AddScalarX(horizontalSeparatorSize.x)

			ShowTooltip(rectRankAndName, cursor, "Role, rank, name")
		}

		RendererSDK.FilledRect(
			new Vector2(rect.pos1.x, rect.pos2.y + playerSeparatorOffset),
			new Vector2(rect.Size.x, playerSeparatorHeight),
			playerSeparatorColor
		)

		const data = currentPlayersCache.get(member.get("id") as bigint)
		if (data === undefined || data[0] === undefined) continue

		{
			const rectTotalMatches = new Rectangle(
				currentPos,
				new Vector2(
					rect.pos1.x + separatorTotalMatchesOffset.x,
					rect.pos2.y
				)
			)

			const userTotalRecord = data[0].total_record
			const totalMatches = userTotalRecord.wins + userTotalRecord.losses
			const totalWinrate =
				totalMatches !== 0
					? (userTotalRecord.wins / totalMatches) * 100
					: 0
			const totalMatchesSrt = `${totalMatches}`
			const totalMatchesSize = RendererSDK.GetTextSize(totalMatchesSrt)
			const totalMatchesPos = rectTotalMatches.pos2.Subtract(
				rectTotalMatches.Size.DivideScalar(2)
			)
			RendererSDK.Text(
				totalMatchesSrt,
				totalMatchesPos
					.Clone()
					.SubtractScalarX(totalMatchesSize.x / 2)
					.SubtractScalarY(totalMatchesSize.y)
			)

			const totalWinrateSrt = `${Math.round(totalWinrate)}%`
			const totalWinrateSize = RendererSDK.GetTextSize(totalWinrateSrt)
			RendererSDK.Text(
				totalWinrateSrt,
				totalMatchesPos
					.Clone()
					.SubtractScalarX(totalWinrateSize.x / 2)
					.AddScalarY(totalMatchesSize.y - totalWinrateSize.y + 5),
				totalMatches !== 0 ? GetWinRateColor(totalWinrate) : Color.Gray
			)

			currentPos = rect.pos1.Add(separatorTotalMatchesOffset)
			RendererSDK.FilledRect(
				currentPos,
				horizontalSeparatorSize,
				lineColor
			)
			currentPos.AddScalarX(horizontalSeparatorSize.x)

			ShowTooltip(
				rectTotalMatches,
				cursor,
				"Total matches (up), overall winrate (down)"
			)
		}

		const userRecentOutcomes = ExtractOutcomesInfo(data[0].recent_outcomes)
		{
			const rectLastInfo = new Rectangle(
				currentPos,
				new Vector2(
					rect.pos1.x + separatorLastInfoOffset.x,
					rect.pos2.y
				)
			)

			const lastSrteakSrt = GetStreakDescription(userRecentOutcomes)
			const lastSrteakSize = RendererSDK.GetTextSize(lastSrteakSrt)
			const lastInfoPos = rectLastInfo.pos2.Subtract(
				rectLastInfo.Size.DivideScalar(2)
			)
			RendererSDK.Text(
				lastSrteakSrt,
				lastInfoPos
					.Clone()
					.SubtractScalarX(lastSrteakSize.x / 2)
					.SubtractScalarY(lastSrteakSize.y),
				GetStreakColor(userRecentOutcomes)
			)

			const lastWinrateSrt = `${Math.round(userRecentOutcomes.winrate)}%`
			const lastWinrateSize = RendererSDK.GetTextSize(lastWinrateSrt)
			RendererSDK.Text(
				lastWinrateSrt,
				lastInfoPos
					.Clone()
					.SubtractScalarX(lastWinrateSize.x / 2)
					.AddScalarY(lastSrteakSize.y - lastWinrateSize.y + 5),
				userRecentOutcomes.matchCount !== 0
					? GetWinRateColor(userRecentOutcomes.winrate)
					: Color.Gray
			)

			currentPos = rect.pos1.Add(separatorLastInfoOffset)
			RendererSDK.FilledRect(
				currentPos,
				horizontalSeparatorSize,
				lineColor
			)
			currentPos.AddScalarX(horizontalSeparatorSize.x)

			ShowTooltip(
				rectLastInfo,
				cursor,
				"Last streak (up), recent winrate (down)\nLast streak starts with either W or L which means it is Winstreak or Losestreak."
			)
		}

		{
			const rectLastCommends = new Rectangle(
				currentPos,
				new Vector2(
					rect.pos1.x + separatorLastCommendsOffset.x,
					rect.pos2.y
				)
			)

			const lastCommendsSrt = `${data[0].recent_commends?.commends ?? 0}`
			const lastCommendsSize = RendererSDK.GetTextSize(
				lastCommendsSrt,
				RendererSDK.DefaultFontName,
				32
			)
			const lastCommendsPos = rectLastCommends.pos2
				.Subtract(rectLastCommends.Size.DivideScalar(2))
				.AddScalarY(lastCommendsSize.y / 2)
				.SubtractScalarX(lastCommendsSize.x / 2)
				.AddScalarX(12)
			RendererSDK.Image(
				"panorama/images/conduct/commend_star_png.vtex_c",
				lastCommendsPos.Subtract(new Vector2(32, 32)).AddScalarY(5),
				-1,
				new Vector2(32, 32),
				Color.Green
			)
			RendererSDK.Text(
				lastCommendsSrt,
				lastCommendsPos.SubtractScalarY(lastCommendsSize.y),
				Color.White,
				RendererSDK.DefaultFontName,
				32
			)

			currentPos = rect.pos1.Add(separatorLastCommendsOffset)
			RendererSDK.FilledRect(
				currentPos,
				horizontalSeparatorSize,
				lineColor
			)
			currentPos.AddScalarX(horizontalSeparatorSize.x)

			ShowTooltip(rectLastCommends, cursor, "Recent commends")
		}

		let loadedAllHeroes = data[1] !== undefined
		if (loadedAllHeroes)
			for (const [, heroData] of data[1])
				if (heroData === undefined) {
					loadedAllHeroes = false
					break
				}
		{
			const rectMostSuccessfulHeroes = new Rectangle(
				currentPos.Clone(),
				new Vector2(
					rect.pos1.x + separatorMostSuccessfulHeroesOffset.x,
					rect.pos2.y
				)
			)

			const sortedHeroes = loadedAllHeroes
				? ArrayExtensions.orderBy(
						[...data[1].entries()].filter(
							([, heroData]) => heroData!.last_match !== undefined
						),
						([, heroData]) => -GetActualTotalRecord(heroData!).wins
				  ).slice(0, heroesPerSection)
				: []

			currentPos = currentPos.AddScalarX(3).AddScalarY(2)
			for (const [heroName, heroData] of sortedHeroes) {
				RendererSDK.Image(
					`panorama/images/heroes/${heroName}_png.vtex_c`,
					currentPos,
					-1,
					heroImageSize
				)
				RenderHeroStats(
					new Rectangle(currentPos, currentPos.Add(heroImageSize)),
					heroData!
				)
				currentPos.AddScalarX(heroImageSize.x + 2)
			}

			currentPos = rect.pos1.Add(separatorMostSuccessfulHeroesOffset)
			RendererSDK.FilledRect(
				currentPos,
				horizontalSeparatorSize,
				lineColor
			)
			currentPos.AddScalarX(horizontalSeparatorSize.x)

			ShowTooltip(
				rectMostSuccessfulHeroes,
				cursor,
				"Most successful heroes\nInfo on left side - overall matches count, overall winrate.\nInfo on right side - last matches count (at most 20), last winrate."
			)
		}

		{
			const rectLastPickedHeroes = new Rectangle(
				currentPos.Clone(),
				new Vector2(
					rect.pos1.x + separatorLastPickedHeroesOffset.x,
					rect.pos2.y
				)
			)

			const sortedHeroes = loadedAllHeroes
				? ArrayExtensions.orderBy(
						[...data[1].entries()].filter(
							([, heroData]) => heroData!.last_match !== undefined
						),
						([, heroData]) =>
							-(heroData?.last_match?.timestamp ?? 0)
				  ).slice(0, heroesPerSection)
				: []

			currentPos = currentPos.AddScalarX(3).AddScalarY(2)
			for (const [heroName, heroData] of sortedHeroes) {
				RendererSDK.Image(
					`panorama/images/heroes/${heroName}_png.vtex_c`,
					currentPos,
					-1,
					heroImageSize
				)
				RenderHeroStats(
					new Rectangle(currentPos, currentPos.Add(heroImageSize)),
					heroData!
				)
				currentPos.AddScalarX(heroImageSize.x + 3)
			}

			currentPos = rect.pos1.Add(separatorLastPickedHeroesOffset)
			RendererSDK.FilledRect(
				currentPos,
				horizontalSeparatorSize,
				lineColor
			)
			currentPos.AddScalarX(horizontalSeparatorSize.x)

			ShowTooltip(
				rectLastPickedHeroes,
				cursor,
				"Recently picked heroes\nInfo on left side - overall matches count, overall winrate.\nInfo on right side - last matches count (at most 20), last winrate."
			)
		}
	}
})

InputEventSDK.on("MouseKeyDown", mask => {
	if (!state.value || !panelShown || currentPlayersCache.size === 0)
		return true

	const cursor = Input.CursorOnScreen
	const guiBaseData = GetGUIBaseData()
	if (!guiBaseData.rect.Contains(cursor)) return true

	if (mask === VMouseKeys.MK_LBUTTON) {
		if (GetGUICloseButton(guiBaseData).Contains(cursor)) {
			panelShown = false
			return false
		}
		if (GetGUIReloadButton(guiBaseData).Contains(cursor)) {
			RealodGUIData()
			return false
		}
		if (sendPing) {
			if (GetGUIAcceptButton(guiBaseData).Contains(cursor)) {
				AcceptGame()
				return false
			}
			// if (GetGUIDeclineButton(guiBaseData).Contains(cursor)) {
			// 	DeclineGame()
			// 	return false
			// }
		}
	}

	return false
})
