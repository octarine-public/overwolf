/* eslint-disable @typescript-eslint/naming-convention */

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
		match_count: number
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
