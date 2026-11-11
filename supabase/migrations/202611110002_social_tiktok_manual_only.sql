-- SAMA-PACK — TikTok reste en publication manuelle dans l'outil interne.
-- La Content Posting API Direct Post n'est pas destinée aux outils utilitaires
-- internes qui ne gèrent que les comptes de l'équipe. Les autres réseaux
-- continuent d'utiliser la file automatique après validation.

create or replace function public.sama_claim_social_targets(p_limit integer default 10)
returns setof public.social_post_targets
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'Accès réservé au moteur de publication.';
  end if;

  return query
  with candidates as (
    select t.id
    from public.social_post_targets t
    join public.social_posts p on p.id = t.post_id
    join public.social_accounts a on a.id = t.social_account_id
    where t.status = 'scheduled'
      and t.provider <> 'tiktok'
      and t.publication_mode in ('automatic','approval')
      and t.scheduled_at is not null
      and t.scheduled_at <= now()
      and a.status = 'connected'
      and p.status in ('scheduled','partially_published')
    order by t.scheduled_at asc, t.created_at asc
    limit greatest(1, least(coalesce(p_limit,10), 25))
    for update of t skip locked
  )
  update public.social_post_targets t
  set status = 'publishing',
      attempt_count = t.attempt_count + 1,
      last_attempt_at = now(),
      updated_at = now()
  from candidates c
  where t.id = c.id
  returning t.*;
end;
$function$;

revoke all on function public.sama_claim_social_targets(integer) from public, anon, authenticated;
grant execute on function public.sama_claim_social_targets(integer) to service_role;
