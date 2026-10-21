-- Due-date-gated immutable scoring for fantasy matches.
-- Apply in Supabase SQL editor.

-- 1) Extend match model with due/finalization timestamps.
ALTER TABLE public.league_matches
ADD COLUMN IF NOT EXISTS score_due_at timestamptz;

ALTER TABLE public.league_matches
ADD COLUMN IF NOT EXISTS finalized_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_league_matches_due_status
ON public.league_matches (league_id, status, score_due_at);

-- 2) Snapshot lineup used at match finalization.
CREATE TABLE IF NOT EXISTS public.match_lineup_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id uuid NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  match_id uuid NOT NULL REFERENCES public.league_matches(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  starting_11 jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (match_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_match_lineup_snapshots_match_user
ON public.match_lineup_snapshots (match_id, user_id);

-- 3) Persist per-player points for immutable match audits.
CREATE TABLE IF NOT EXISTS public.match_player_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id uuid NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  match_id uuid NOT NULL REFERENCES public.league_matches(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  player_name text NOT NULL,
  round_number integer NOT NULL,
  points numeric NOT NULL DEFAULT 0,
  breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (match_id, user_id, player_name)
);

CREATE INDEX IF NOT EXISTS idx_match_player_points_match_user
ON public.match_player_points (match_id, user_id);

-- 4) Per-player point breakdown for Nth real match (after ignored rounds).
CREATE OR REPLACE FUNCTION public.calculate_player_match_points_v2(
    stats jsonb,
    player_name text,
    round_number integer,
    ignored_rounds integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
    v_player jsonb;
    v_match_url text;
    v_match_count int;
    v_batting jsonb;
    v_bowling jsonb;
    v_fielding jsonb;
    v_effective_round int := GREATEST(1, round_number + GREATEST(COALESCE(ignored_rounds, 0), 0));

    v_bat_runs_pts numeric := 0;
    v_bat_fours_pts numeric := 0;
    v_bat_sixes_pts numeric := 0;

    v_bowl_econ_pts numeric := 0;
    v_bowl_wicket_pts numeric := 0;

    v_field_catch_pts numeric := 0;
    v_field_stumping_pts numeric := 0;
    v_field_runout_pts numeric := 0;

    v_total_points numeric := 0;
BEGIN
    v_player := stats->'players'->player_name;
    IF v_player IS NULL THEN
        RETURN jsonb_build_object(
            'total_points', 0,
            'breakdown', jsonb_build_object(
                'batting', jsonb_build_object('runs', 0, 'fours', 0, 'sixes', 0),
                'bowling', jsonb_build_object('economy', 0, 'wickets', 0),
                'fielding', jsonb_build_object('catches', 0, 'stumpings', 0, 'runouts', 0)
            )
        );
    END IF;

    SELECT COUNT(*) INTO v_match_count
    FROM (
        SELECT DISTINCT m.match_url
        FROM (
            SELECT b->>'matchUrl' AS match_url
            FROM jsonb_array_elements(COALESCE(v_player->'batting', '[]'::jsonb)) b
            UNION
            SELECT bw->>'matchUrl' AS match_url
            FROM jsonb_array_elements(COALESCE(v_player->'bowling', '[]'::jsonb)) bw
        ) m
        WHERE m.match_url IS NOT NULL AND m.match_url <> ''
    ) all_entries;

    IF v_match_count < v_effective_round THEN
        RETURN jsonb_build_object(
            'total_points', 0,
            'breakdown', jsonb_build_object(
                'batting', jsonb_build_object('runs', 0, 'fours', 0, 'sixes', 0),
                'bowling', jsonb_build_object('economy', 0, 'wickets', 0),
                'fielding', jsonb_build_object('catches', 0, 'stumpings', 0, 'runouts', 0)
            )
        );
    END IF;

    SELECT entry.match_url INTO v_match_url
    FROM (
        SELECT DISTINCT ON (x.match_url)
            x.match_url,
            x.match_number
        FROM (
            SELECT b->>'matchUrl' AS match_url, NULLIF(b->>'matchNumber', '')::int AS match_number
            FROM jsonb_array_elements(COALESCE(v_player->'batting', '[]'::jsonb)) b
            UNION
            SELECT bw->>'matchUrl' AS match_url, NULLIF(bw->>'matchNumber', '')::int AS match_number
            FROM jsonb_array_elements(COALESCE(v_player->'bowling', '[]'::jsonb)) bw
        ) x
        WHERE x.match_url IS NOT NULL AND x.match_url <> ''
        ORDER BY x.match_url, x.match_number NULLS LAST
    ) entry
    ORDER BY entry.match_number NULLS LAST, entry.match_url
    OFFSET v_effective_round - 1
    LIMIT 1;

    IF v_match_url IS NULL THEN
        RETURN jsonb_build_object(
            'total_points', 0,
            'breakdown', jsonb_build_object(
                'batting', jsonb_build_object('runs', 0, 'fours', 0, 'sixes', 0),
                'bowling', jsonb_build_object('economy', 0, 'wickets', 0),
                'fielding', jsonb_build_object('catches', 0, 'stumpings', 0, 'runouts', 0)
            )
        );
    END IF;

    SELECT b INTO v_batting
    FROM jsonb_array_elements(COALESCE(v_player->'batting', '[]'::jsonb)) b
    WHERE b->>'matchUrl' = v_match_url
    LIMIT 1;

    SELECT b INTO v_bowling
    FROM jsonb_array_elements(COALESCE(v_player->'bowling', '[]'::jsonb)) b
    WHERE b->>'matchUrl' = v_match_url
    LIMIT 1;

    SELECT f INTO v_fielding
    FROM jsonb_array_elements(COALESCE(v_player->'fielding', '[]'::jsonb)) f
    WHERE f->>'matchUrl' = v_match_url
    LIMIT 1;

    v_bat_runs_pts := COALESCE(NULLIF(v_batting->>'runs', '')::int, 0) * 1;
    v_bat_fours_pts := COALESCE(NULLIF(v_batting->>'fours', '')::int, 0) * 2;
    v_bat_sixes_pts := COALESCE(NULLIF(v_batting->>'sixes', '')::int, 0) * 3;

    IF COALESCE(NULLIF(v_bowling->>'overs', '')::numeric, 0) > 0 THEN
        v_bowl_econ_pts := 10 - COALESCE(NULLIF(v_bowling->>'economy', '')::numeric, 0);
    END IF;
    v_bowl_wicket_pts := COALESCE(NULLIF(v_bowling->>'wickets', '')::int, 0) * 20;

    v_field_catch_pts := COALESCE(NULLIF(v_fielding->>'catches', '')::int, 0) * 8;
    v_field_stumping_pts := COALESCE(NULLIF(v_fielding->>'stumpings', '')::int, 0) * 5;
    v_field_runout_pts := COALESCE(NULLIF(v_fielding->>'runouts', '')::int, 0) * 4;

    v_total_points :=
        v_bat_runs_pts + v_bat_fours_pts + v_bat_sixes_pts +
        v_bowl_econ_pts + v_bowl_wicket_pts +
        v_field_catch_pts + v_field_stumping_pts + v_field_runout_pts;

    RETURN jsonb_build_object(
        'total_points', ROUND(v_total_points, 1),
        'breakdown', jsonb_build_object(
            'batting', jsonb_build_object(
                'runs', ROUND(v_bat_runs_pts, 1),
                'fours', ROUND(v_bat_fours_pts, 1),
                'sixes', ROUND(v_bat_sixes_pts, 1)
            ),
            'bowling', jsonb_build_object(
                'economy', ROUND(v_bowl_econ_pts, 1),
                'wickets', ROUND(v_bowl_wicket_pts, 1)
            ),
            'fielding', jsonb_build_object(
                'catches', ROUND(v_field_catch_pts, 1),
                'stumpings', ROUND(v_field_stumping_pts, 1),
                'runouts', ROUND(v_field_runout_pts, 1)
            )
        )
    );
END;
$$;

-- 5) Finalize exactly one match once due date has passed.
CREATE OR REPLACE FUNCTION public.finalize_due_match_scores(
    p_match_id uuid,
    p_ignored_rounds integer DEFAULT 0
)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
    v_match public.league_matches%ROWTYPE;
    v_stats jsonb;
    v_team_user_id uuid;
    v_lineup jsonb;
    v_lineup11 jsonb;
    v_player_name text;
    v_points_payload jsonb;
    v_points numeric;
    v_team_a_total numeric := 0;
    v_team_b_total numeric := 0;
BEGIN
    SELECT *
    INTO v_match
    FROM public.league_matches
    WHERE id = p_match_id
    FOR UPDATE;

    IF v_match.id IS NULL THEN
        RETURN false;
    END IF;

    IF COALESCE(v_match.status, 'pending') = 'completed' OR v_match.finalized_at IS NOT NULL THEN
        RETURN false;
    END IF;

    IF v_match.score_due_at IS NULL OR v_match.score_due_at > timezone('utc', now()) THEN
        RETURN false;
    END IF;

    SELECT t.data
    INTO v_stats
    FROM public.tournament_stats t
    WHERE t.data IS NOT NULL
    ORDER BY t.updated_at DESC, t.id DESC
    LIMIT 1;

    IF v_stats IS NULL THEN
        RETURN false;
    END IF;

    FOR v_team_user_id IN SELECT UNNEST(ARRAY[v_match.team_a_id, v_match.team_b_id]) LOOP
        SELECT mls.starting_11
        INTO v_lineup11
        FROM public.match_lineup_snapshots mls
        WHERE mls.match_id = v_match.id
          AND mls.user_id = v_team_user_id
        LIMIT 1;

        IF v_lineup11 IS NULL THEN
            SELECT COALESCE(ut.starting_11, '[]'::jsonb)
            INTO v_lineup
            FROM public.users_teams ut
            WHERE ut.id = v_team_user_id
              AND ut.league_id = v_match.league_id
            LIMIT 1;

            SELECT COALESCE(jsonb_agg(entry.value ORDER BY entry.ordinality), '[]'::jsonb)
            INTO v_lineup11
            FROM jsonb_array_elements_text(COALESCE(v_lineup, '[]'::jsonb)) WITH ORDINALITY AS entry(value, ordinality)
            WHERE entry.ordinality <= 11;

            INSERT INTO public.match_lineup_snapshots (league_id, match_id, user_id, starting_11)
            VALUES (v_match.league_id, v_match.id, v_team_user_id, COALESCE(v_lineup11, '[]'::jsonb))
            ON CONFLICT (match_id, user_id) DO NOTHING;
        END IF;

        DELETE FROM public.match_player_points
        WHERE match_id = v_match.id
          AND user_id = v_team_user_id;

        FOR v_player_name IN
            SELECT value FROM jsonb_array_elements_text(COALESCE(v_lineup11, '[]'::jsonb))
        LOOP
            v_points_payload := public.calculate_player_match_points_v2(v_stats, v_player_name, v_match.round_number, p_ignored_rounds);
            v_points := COALESCE((v_points_payload->>'total_points')::numeric, 0);

            INSERT INTO public.match_player_points (
                league_id,
                match_id,
                user_id,
                player_name,
                round_number,
                points,
                breakdown
            ) VALUES (
                v_match.league_id,
                v_match.id,
                v_team_user_id,
                v_player_name,
                v_match.round_number,
                v_points,
                COALESCE(v_points_payload->'breakdown', '{}'::jsonb)
            );

            IF v_team_user_id = v_match.team_a_id THEN
                v_team_a_total := v_team_a_total + v_points;
            ELSE
                v_team_b_total := v_team_b_total + v_points;
            END IF;
        END LOOP;
    END LOOP;

    UPDATE public.league_matches lm
    SET
        team_a_score = ROUND(v_team_a_total::numeric, 1),
        team_b_score = ROUND(v_team_b_total::numeric, 1),
        winner_id = CASE
            WHEN ROUND(v_team_a_total::numeric, 1) > ROUND(v_team_b_total::numeric, 1) THEN v_match.team_a_id
            WHEN ROUND(v_team_b_total::numeric, 1) > ROUND(v_team_a_total::numeric, 1) THEN v_match.team_b_id
            ELSE NULL
        END,
        status = 'completed',
        finalized_at = timezone('utc', now())
    WHERE lm.id = v_match.id
      AND COALESCE(lm.status, 'pending') <> 'completed';

    RETURN true;
END;
$$;

-- 6) Batch finalize only due matches and keep completed ones immutable.
CREATE OR REPLACE FUNCTION public.update_round_scores(
    league_id uuid,
    ignored_rounds integer DEFAULT 0
)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
    v_match_id uuid;
    v_count integer := 0;
BEGIN
    FOR v_match_id IN
        SELECT lm.id
        FROM public.league_matches lm
        WHERE lm.league_id = update_round_scores.league_id
          AND COALESCE(lm.status, 'pending') <> 'completed'
          AND lm.score_due_at IS NOT NULL
          AND lm.score_due_at <= timezone('utc', now())
        ORDER BY lm.round_number, lm.created_at, lm.id
    LOOP
        IF public.finalize_due_match_scores(v_match_id, ignored_rounds) THEN
            v_count := v_count + 1;
        END IF;
    END LOOP;

    RETURN v_count;
END;
$$;

-- 7) Legacy one-arg wrapper for compatibility.
CREATE OR REPLACE FUNCTION public.update_round_scores(
    league_id uuid
)
RETURNS integer
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN public.update_round_scores(league_id, 0);
END;
$$;

-- 8) Read API for fixture-team breakdown modal.
CREATE OR REPLACE FUNCTION public.get_match_team_breakdown(
    p_match_id uuid,
    p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_match public.league_matches%ROWTYPE;
    v_starting_11 jsonb;
    v_players jsonb;
    v_team_total numeric := 0;
BEGIN
    SELECT *
    INTO v_match
    FROM public.league_matches
    WHERE id = p_match_id
    LIMIT 1;

    IF v_match.id IS NULL THEN
        RETURN jsonb_build_object('error', 'Match not found');
    END IF;

    SELECT mls.starting_11
    INTO v_starting_11
    FROM public.match_lineup_snapshots mls
    WHERE mls.match_id = p_match_id
      AND mls.user_id = p_user_id
    LIMIT 1;

    IF v_starting_11 IS NULL THEN
        SELECT COALESCE(ut.starting_11, '[]'::jsonb)
        INTO v_starting_11
        FROM public.users_teams ut
        WHERE ut.id = p_user_id
          AND ut.league_id = v_match.league_id
        LIMIT 1;
    END IF;

    WITH lineup AS (
        SELECT entry.value AS player_name, entry.ordinality AS ord
        FROM jsonb_array_elements_text(COALESCE(v_starting_11, '[]'::jsonb)) WITH ORDINALITY AS entry(value, ordinality)
    )
    SELECT
        COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'player_name', l.player_name,
                    'points', ROUND(COALESCE(mpp.points, 0)::numeric, 1),
                    'breakdown', COALESCE(mpp.breakdown, '{}'::jsonb)
                )
                ORDER BY l.ord
            ),
            '[]'::jsonb
        ),
        COALESCE(SUM(mpp.points), 0)
    INTO v_players, v_team_total
    FROM lineup l
    LEFT JOIN public.match_player_points mpp
      ON mpp.match_id = p_match_id
     AND mpp.user_id = p_user_id
     AND mpp.player_name = l.player_name;

    RETURN jsonb_build_object(
        'match_id', p_match_id,
        'league_id', v_match.league_id,
        'round_number', v_match.round_number,
        'status', v_match.status,
        'score_due_at', v_match.score_due_at,
        'finalized_at', v_match.finalized_at,
        'user_id', p_user_id,
        'starting_11', COALESCE(v_starting_11, '[]'::jsonb),
        'team_total', ROUND(v_team_total::numeric, 1),
        'players', COALESCE(v_players, '[]'::jsonb)
    );
END;
$$;

-- 9) Commissioner scheduling helpers.
CREATE OR REPLACE FUNCTION public.set_match_score_due_at(
    p_match_id uuid,
    p_score_due_at timestamptz
)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
    v_count integer;
BEGIN
    UPDATE public.league_matches
    SET score_due_at = p_score_due_at
    WHERE id = p_match_id
      AND COALESCE(status, 'pending') <> 'completed';

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_round_score_due_at(
    p_league_id uuid,
    p_round_number integer,
    p_score_due_at timestamptz
)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
    v_count integer;
BEGIN
    UPDATE public.league_matches
    SET score_due_at = p_score_due_at
    WHERE league_id = p_league_id
      AND round_number = p_round_number
      AND COALESCE(status, 'pending') <> 'completed';

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;
