-- High-confidence POIs were filtered before import, so treat the existing Amap set as verified.
update public.statues
set verification_status = 'verified',
    "desc" = '该点位由高德地图公开 POI 检索收录，已纳入高可信初筛，现场图片待补充。',
    updated_at = now()
where source = '高德地图 Web 服务 API'
  and status = 'approved';
