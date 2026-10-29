-- Keep visitor access limited to public settings columns; private settings remain protected by column grants and RLS.
GRANT SELECT (id) ON TABLE public.settings TO anon;

-- Promotion eligibility is checked transactionally in sama_place_order.
CREATE OR REPLACE FUNCTION public.sama_place_order(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_customer jsonb := coalesce(p_payload->'customer', '{}'::jsonb);
  v_items jsonb := coalesce(p_payload->'items', '[]'::jsonb);
  v_customer_id uuid;
  v_existing_user_id uuid;
  v_business_id uuid;
  v_referrer uuid;
  v_code text := upper(regexp_replace(coalesce(p_payload->>'sales_referral_code',''), '[^A-Za-z0-9_-]', '', 'g'));
  v_order_id text;
  v_name text := trim(coalesce(v_customer->>'name',''));
  v_phone text := regexp_replace(coalesce(v_customer->>'phone',''), '[^0-9+]', '', 'g');
  v_address text := trim(coalesce(v_customer->>'address',''));
  v_zone text := trim(coalesce(v_customer->>'zone',''));
  v_payment_choice text := coalesce(p_payload->>'payment_choice','');
  v_order_status text;
  v_payment_label text;
  v_subtotal numeric := 0;
  v_delivery numeric := 0;
  v_fee_rate numeric := 0;
  v_total numeric := 0;
  v_item jsonb;
  v_product record;
  v_qty integer;
  v_saved_items jsonb := '[]'::jsonb;
begin
  if v_user_id is null then raise exception 'Connecte-toi ou crée un compte avant de confirmer ta commande.'; end if;
  if not exists(select 1 from public.profiles p where p.id = v_user_id) then raise exception 'Profil utilisateur introuvable. Déconnecte-toi puis reconnecte-toi.'; end if;
  if v_payment_choice not in ('pay_now','pay_later') then raise exception 'Choisis « Payer maintenant » ou « Payer plus tard » pour continuer.'; end if;
  if length(v_name) < 2 or length(v_name) > 120 or length(v_phone) < 8 or length(v_phone) > 25 or length(v_address) < 4 or length(v_address) > 300 then
    raise exception 'Vérifie le nom, le téléphone et l’adresse de livraison.';
  end if;
  if jsonb_typeof(v_items) is distinct from 'array' or jsonb_array_length(v_items) < 1 or jsonb_array_length(v_items) > 50 then
    raise exception 'Le panier est vide ou contient trop de lignes.';
  end if;

  select greatest(coalesce(s.delivery_fee,0),0), greatest(coalesce(s.payment_fee_percent,0),0)
    into v_delivery, v_fee_rate from public.settings s where s.id = true;
  v_delivery := coalesce(v_delivery,0);
  v_fee_rate := coalesce(v_fee_rate,0);

  if v_payment_choice = 'pay_later' and v_delivery <= 0 then
    raise exception 'Les frais de livraison sont nuls ou indisponibles. Le paiement intégral est requis pour confirmer cette commande.';
  end if;

  if nullif(p_payload->>'business_account_id','') is not null then
    begin v_business_id := (p_payload->>'business_account_id')::uuid;
    exception when others then raise exception 'Compte professionnel invalide.'; end;
    if not exists(select 1 from public.business_accounts b where b.id = v_business_id and b.owner_user_id = v_user_id) then
      raise exception 'Ce compte professionnel ne vous appartient pas.';
    end if;
  end if;

  select c.owner_user_id into v_referrer from public.sales_referral_codes c where c.active and c.code = v_code;
  if v_referrer is null then v_code := null; end if;

  v_order_status := case when v_payment_choice = 'pay_now' then 'awaiting_payment' else 'awaiting_delivery_payment' end;
  v_payment_label := case when v_payment_choice = 'pay_now'
    then 'PayDunya — paiement intégral en ligne'
    else 'PayDunya — livraison à payer en ligne, solde à régler à la livraison' end;

  perform pg_advisory_xact_lock(hashtext(v_phone));
  select c.id, c.user_id into v_customer_id, v_existing_user_id
    from public.customers c where c.phone = v_phone for update;
  if v_customer_id is not null and v_existing_user_id is not null and v_existing_user_id <> v_user_id then
    raise exception 'Ce numéro de téléphone est déjà associé à un autre compte. Utilise ton numéro ou contacte Sama-Pack.';
  end if;
  if v_customer_id is null then
    insert into public.customers(name, phone, address, zone, orders_count, last_order_at, user_id)
    values(v_name, v_phone, v_address, v_zone, 1, now(), v_user_id) returning id into v_customer_id;
  else
    update public.customers set name = v_name, address = v_address, zone = v_zone,
      orders_count = orders_count + 1, last_order_at = now(), user_id = coalesce(user_id, v_user_id), updated_at = now()
    where id = v_customer_id;
  end if;

  for v_item in select value from jsonb_array_elements(v_items) as j(value)
  loop
    begin v_qty := (v_item->>'quantity')::integer;
    exception when others then raise exception 'Quantité invalide dans le panier.'; end;
    if v_qty is null or v_qty < 1 or v_qty > 99 then raise exception 'Chaque quantité doit être comprise entre 1 et 99.'; end if;
    select p.id, p.name,
      case when p.promo_active is true
                and p.promo_price is not null
                and p.promo_price >= 0
                and p.promo_price < p.price
                and (p.promo_started_at is null or p.promo_started_at <= now())
                and (p.promo_end_at is null or p.promo_end_at > now())
           then p.promo_price else p.price end as price,
      p.active, p.availability_status, p.price as regular_price
      into v_product
      from public.products p where p.id = coalesce(v_item->>'product_id', v_item->>'id') for share;
    if not found or not v_product.active or v_product.availability_status <> 'available' or coalesce(v_product.regular_price,0) <= 0 then
      raise exception 'Un produit du panier est en rupture de stock ou son prix reste à confirmer.';
    end if;
    v_subtotal := v_subtotal + (v_product.price * v_qty);
    v_saved_items := v_saved_items || jsonb_build_array(jsonb_build_object(
      'product_id', v_product.id, 'product_name', v_product.name, 'quantity', v_qty, 'unit_price', v_product.price
    ));
  end loop;

  v_total := v_subtotal + v_delivery;
  v_order_id := 'CMD-' || to_char(now() at time zone 'UTC', 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
  insert into public.orders(
    id, customer_id, user_id, customer_name, customer_phone, delivery_address, delivery_zone,
    status, slot, payment, subtotal, delivery, total, payment_choice, payment_status, amount_paid,
    business_account_id, sales_referral_code, sales_referrer_user_id, payment_fee_percent
  )
  values(
    v_order_id, v_customer_id, v_user_id, v_name, v_phone, v_address, v_zone,
    v_order_status, left(coalesce(p_payload->>'slot',''),120), v_payment_label,
    v_subtotal, v_delivery, v_total, v_payment_choice, 'pending', 0,
    v_business_id, v_code, v_referrer, v_fee_rate
  );

  for v_item in select value from jsonb_array_elements(v_saved_items) as j(value)
  loop
    insert into public.order_items(order_id, product_id, product_name, quantity, unit_price)
    values(v_order_id, v_item->>'product_id', v_item->>'product_name', (v_item->>'quantity')::integer, (v_item->>'unit_price')::numeric);
  end loop;

  return jsonb_build_object('ok',true,'order',jsonb_build_object(
    'id',v_order_id,'subtotal',v_subtotal,'delivery',v_delivery,'total',v_total,'status',v_order_status,
    'payment_choice',v_payment_choice,'payment_status','pending','amount_paid',0,'items',v_saved_items,
    'business_account_id',v_business_id,'sales_referral_code',v_code
  ));
end;
$function$

