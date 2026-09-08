-- Optional structured columns for TD Pool engine metadata.
-- Feature snapshots remain in research_json.td_model for compatibility.

alter table player_week_data
  add column if not exists model_version text,
  add column if not exists data_completeness double precision,
  add column if not exists calculated_at timestamptz;

create index if not exists player_week_data_week_prob_idx
  on player_week_data (week_id, our_probability desc);

create index if not exists player_week_data_model_version_idx
  on player_week_data (model_version);
