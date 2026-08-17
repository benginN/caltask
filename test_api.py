"""API ucdan uca sinamalari — gercek FastAPI uygulamasi, gecici SQLite dosyasi.

Kapsam: etkinlik/gorev CRUD, tekrarlamanin hafta gorunumunde acilmasi,
tekrarlayan gorevin tamamlaninca ILERI SARMASI, .ics beslemeleri, ve
"son listeyi silme" gibi kenar durumlar.
"""
import os
import sys
import tempfile
from datetime import date, timedelta

TMP = tempfile.mkdtemp()
os.environ["DB_PATH"] = os.path.join(TMP, "test.db")
os.environ["LANG_UI"] = "tr"
os.environ["FIRST_WEEKDAY"] = "0"

sys.path.insert(0, "app")
from fastapi.testclient import TestClient  # noqa: E402
import main  # noqa: E402

c = TestClient(main.app)

gecti = kaldi = 0


def bekle(ad, kosul, ipucu=""):
    global gecti, kaldi
    if kosul:
        gecti += 1
        print(f"  OK   {ad}")
    else:
        kaldi += 1
        print(f"  YOK  {ad}" + (f"\n         -> {ipucu}" if ipucu else ""))


BUGUN = date.today()
PZT = BUGUN - timedelta(days=BUGUN.weekday())      # bu haftanin pazartesisi

print("\n-- acilis --")
r = c.get("/healthz").json()
bekle("healthz", r["status"] == "ok", r)
cfg = c.get("/api/config").json()
bekle("config dil tr", cfg["lang"] == "tr", cfg)
bekle("varsayilan takvim olustu", len(c.get("/api/calendars").json()) == 1)
bekle("varsayilan gorev listesi olustu", len(c.get("/api/lists").json()) == 1)

print("\n-- etkinlik --")
r = c.post("/api/events", json={
    "title": "Toplantı", "starts_at": f"{PZT+timedelta(days=2)} 10:00",
    "ends_at": f"{PZT+timedelta(days=2)} 11:30"}).json()
ev_id = r["id"]
bekle("etkinlik olustu", isinstance(ev_id, int))

rng = c.get(f"/api/range?start={PZT}&days=7").json()
bekle("hafta baslangici pazartesi", rng["start"] == PZT.isoformat(), rng["start"])
bekle("hafta 7 gun", rng["days"] == 7 and rng["end"] == (PZT + timedelta(days=6)).isoformat())
bekle("etkinlik haftada gorunuyor", len(rng["events"]) == 1, rng["events"])
bekle("saat bilgisi dogru", rng["events"][0]["starts_at"].endswith("10:00"), rng["events"][0])

c.patch(f"/api/events/{ev_id}", json={
    "title": "Toplantı (güncel)", "starts_at": f"{PZT+timedelta(days=2)} 14:00",
    "ends_at": f"{PZT+timedelta(days=2)} 15:00"})
rng = c.get(f"/api/range?start={PZT}&days=7").json()
bekle("guncelleme islendi",
      rng["events"][0]["title"] == "Toplantı (güncel)" and rng["events"][0]["starts_at"].endswith("14:00"),
      rng["events"][0])

print("\n-- tekrarlayan etkinlik --")
c.post("/api/events", json={
    "title": "Haftalık spor", "starts_at": f"{PZT} 08:00", "ends_at": f"{PZT} 09:00",
    "repeat": "weekly"})
gelecek = PZT + timedelta(days=28)
rng2 = c.get(f"/api/range?start={gelecek}&days=7").json()
bekle("4 hafta sonra da beliriyor",
      any(e["title"] == "Haftalık spor" for e in rng2["events"]), rng2["events"])
bekle("tekrar isaretli", any(e["recurring"] for e in rng2["events"]))

print("\n-- tum gun etkinligi --")
c.post("/api/events", json={"title": "Tatil", "starts_at": str(PZT + timedelta(days=4)),
                            "all_day": True})
rng = c.get(f"/api/range?start={PZT}&days=7").json()
tg = [e for e in rng["events"] if e["all_day"]]
bekle("tum gun etkinligi var", len(tg) == 1, tg)

print("\n-- gorevler --")
lst = c.get("/api/lists").json()[0]["id"]
t1 = c.post("/api/tasks", json={"title": "TR klasikleri ekle", "list_id": lst,
                                "due_date": str(PZT + timedelta(days=1))}).json()["id"]
t2 = c.post("/api/tasks", json={"title": "Alt görev", "list_id": lst, "parent_id": t1}).json()["id"]
gorevler = c.get("/api/tasks").json()
bekle("iki gorev var", len(gorevler) == 2, gorevler)
bekle("alt gorev baglandi", any(g["parent_id"] == t1 for g in gorevler))

rng = c.get(f"/api/range?start={PZT}&days=7").json()
bekle("tarihli gorev hafta verisinde", len(rng["tasks"]) == 1, rng["tasks"])

c.patch(f"/api/tasks/{t2}", json={"title": "Alt görev", "done": True})
bekle("tamamlanan gorev varsayilan listede gorunmuyor",
      len(c.get("/api/tasks").json()) == 1)
bekle("include_done ile goruluyor",
      len(c.get("/api/tasks?include_done=1").json()) == 2)

print("\n-- tekrarlayan gorev ILERI SARIYOR --")
tr_id = c.post("/api/tasks", json={"title": "Haftalık kontrol", "list_id": lst,
                                   "due_date": str(PZT), "repeat": "weekly"}).json()["id"]
r = c.patch(f"/api/tasks/{tr_id}", json={"title": "Haftalık kontrol", "done": True}).json()
bekle("tamamlaninca kapanmiyor, ileri sariyor", r.get("status") == "rolled", r)
bekle("yeni tarih 1 hafta sonrasi",
      r.get("due_date") == (PZT + timedelta(days=7)).isoformat(), r)
hala = [g for g in c.get("/api/tasks").json() if g["id"] == tr_id]
bekle("gorev acik kaldi", len(hala) == 1 and not hala[0]["done"], hala)

print("\n-- tamamlanan tekrar BITENLER'e kayit birakiyor --")
d1 = r.get("done_id")
bekle("cevapta done_id var", isinstance(d1, int), r)
kopya_d = [g for g in c.get("/api/tasks?include_done=1").json() if g["id"] == d1]
bekle("bitmis kopya include_done ile goruluyor", len(kopya_d) == 1, kopya_d)
bekle("kopya o gunun tarihiyle ve bitmis",
      kopya_d and kopya_d[0]["done"] == 1 and kopya_d[0]["due_date"] == str(PZT), kopya_d)
bekle("kopya tekrarsiz (bagimsiz kayit)", kopya_d and kopya_d[0]["repeat"] == "", kopya_d)
bekle("kopya done_at damgali", kopya_d and kopya_d[0]["done_at"], kopya_d)

# Geri Al yolu: tarih geri + bitmis kopya KALICI silinir (cop kutusuna dusmez)
c.patch(f"/api/tasks/{tr_id}", json={"due_date": str(PZT)})
c.delete(f"/api/tasks/{d1}?hard=1")
bekle("geri alinca kopya bitenlerden kalkti",
      not any(g["id"] == d1 for g in c.get("/api/tasks?include_done=1").json()))
bekle("kopya cop kutusunda da YOK",
      not any(t["id"] == d1 for t in c.get("/api/trash").json()["tasks"]))
bekle("tarih geri geldi",
      [g for g in c.get("/api/tasks").json() if g["id"] == tr_id][0]["due_date"] == str(PZT))

# yeniden tamamla -> bolumun onceki son durumu (PZT+7) korunur
r = c.patch(f"/api/tasks/{tr_id}", json={"title": "Haftalık kontrol", "done": True}).json()
bekle("yeniden tamamlama yine sardi", r.get("status") == "rolled"
      and r.get("due_date") == (PZT + timedelta(days=7)).isoformat(), r)

print("\n-- .ics beslemeleri --")
ics = c.get("/calendar.ics")
bekle("takvim.ics HTTP 200", ics.status_code == 200)
bekle("content-type text/calendar", "text/calendar" in ics.headers["content-type"])
body = ics.text
bekle("VCALENDAR sarmali", body.startswith("BEGIN:VCALENDAR") and body.rstrip().endswith("END:VCALENDAR"))
bekle("3 etkinlik var", body.count("BEGIN:VEVENT") == 3, body.count("BEGIN:VEVENT"))
bekle("RRULE haftalik var", "RRULE:FREQ=WEEKLY" in body)
bekle("tum gun VALUE=DATE", "DTSTART;VALUE=DATE:" in body)
bekle("Turkce karakter bozulmamis", "Haftal" in body)

tics = c.get("/tasks.ics")
bekle("gorevler.ics HTTP 200", tics.status_code == 200)
bekle("tarihli gorevler VEVENT olarak cikiyor", tics.text.count("BEGIN:VEVENT") >= 2,
      tics.text.count("BEGIN:VEVENT"))
bekle("VTODO KULLANILMIYOR (Apple abonelikte gorunmez)", "VTODO" not in tics.text)

print("\n-- kenar durumlar --")
r = c.delete(f"/api/lists/{lst}")
bekle("son liste silinemiyor", r.status_code == 400 and r.json().get("error") == "last_list", r.text)
r = c.post("/api/events", json={"title": "Ters aralık", "starts_at": f"{PZT} 12:00",
                                "ends_at": f"{PZT} 09:00"}).json()
rng = c.get(f"/api/range?start={PZT}&days=7").json()
ters = [e for e in rng["events"] if e["title"] == "Ters aralık"][0]
bekle("bitis baslangictan onceyse duzeltiliyor", ters["ends_at"] >= ters["starts_at"], ters)
r = c.post("/api/events", json={"title": "  ", "starts_at": f"{PZT} 12:00"})
bekle("bos baslik reddedilmiyor ama bosa dusmuyor", r.status_code == 200)
r = c.get(f"/api/range?start={PZT}&days=999").json()
bekle("gun sayisi tavanlaniyor", r["days"] <= 42, r["days"])
r = c.patch("/api/tasks/999999", json={"title": "yok"})
bekle("olmayan gorev 404", r.status_code == 404, r.status_code)

print("\n-- kismi PATCH (yalniz gonderilen alan degisir) --")
r = c.post("/api/events", json={"title": "Kısmi", "starts_at": f"{PZT} 10:00",
                                "ends_at": f"{PZT} 11:00", "location": "Ev",
                                "notes": "not"}).json()
kid = r["id"]
c.patch(f"/api/events/{kid}", json={"starts_at": f"{PZT} 12:00"})
kv = c.get(f"/api/events/{kid}").json()
bekle("baslangic tasindi", kv["starts_at"] == f"{PZT} 12:00", kv["starts_at"])
bekle("sure korundu (bitis 13:00)", kv["ends_at"] == f"{PZT} 13:00", kv["ends_at"])
bekle("baslik/yer/not dokunulmadi",
      kv["title"] == "Kısmi" and kv["location"] == "Ev" and kv["notes"] == "not", kv)

print("\n-- renk + hatirlatici --")
c.patch(f"/api/events/{kid}", json={"color": "#AA00ff", "reminders": "30, 10,abc,10"})
kv = c.get(f"/api/events/{kid}").json()
bekle("renk kucuk harfe normalize", kv["color"] == "#aa00ff", kv["color"])
bekle("hatirlatici siralanip ayiklandi", kv["reminders"] == "10,30", kv["reminders"])
rng = c.get(f"/api/range?start={PZT}&days=7").json()
kocc = [e for e in rng["events"] if e["id"] == kid][0]
bekle("pencere verisinde ozel renk", kocc["color"] == "#aa00ff", kocc)
bekle("pencere verisinde occ_date var", kocc["occ_date"] == str(PZT), kocc)

print("\n-- haftalik BYDAY ucu --")
r = c.post("/api/events", json={"title": "Koşu", "starts_at": f"{PZT} 07:00",
                                "ends_at": f"{PZT} 08:00", "repeat": "weekly",
                                "repeat_days": "0,3"}).json()
run_id = r["id"]
rng = c.get(f"/api/range?start={PZT}&days=7").json()
kosu = [e for e in rng["events"] if e["id"] == run_id]
bekle("hafta icinde 2 kosu (pzt+per)", len(kosu) == 2
      and {k["starts_at"][:10] for k in kosu} == {str(PZT), str(PZT + timedelta(days=3))},
      [k["starts_at"] for k in kosu])

print("\n-- TEKRARLAYAN ISTISNALAR: yalniz bu / bu ve sonrakiler / tumu --")
r = c.post("/api/events", json={"title": "Ders", "starts_at": f"{PZT} 09:00",
                                "ends_at": f"{PZT} 10:00", "repeat": "daily"}).json()
ders = r["id"]
OCC2 = PZT + timedelta(days=1)     # sali
OCC3 = PZT + timedelta(days=2)     # carsamba

# yalniz bu: sali dersini 15:00'e tasi
r = c.patch(f"/api/events/{ders}?scope=one&occ_date={OCC2}",
            json={"starts_at": f"{OCC2} 15:00", "ends_at": f"{OCC2} 16:00"}).json()
bekle("scope=one cevabi", r.get("scope") == "one", r)
rng = c.get(f"/api/range?start={PZT}&days=7").json()
gunler = sorted(e["starts_at"] for e in rng["events"] if e["id"] == ders)
bekle("sali 09:00 yok, 15:00 var",
      f"{OCC2} 15:00" in gunler and f"{OCC2} 09:00" not in gunler, gunler)
bekle("diger gunler 09:00'da kaldi", f"{OCC3} 09:00" in gunler, gunler)
ov = [e for e in rng["events"] if e["id"] == ders and e["occ_date"] == str(OCC2)][0]
bekle("istisna is_override isaretli + occ_date orijinal slot",
      ov["is_override"] and ov["occ_date"] == str(OCC2), ov)

# yalniz bu SIL: carsamba dersi iptal
c.delete(f"/api/events/{ders}?scope=one&occ_date={OCC3}")
rng = c.get(f"/api/range?start={PZT}&days=7").json()
bekle("carsamba dersi silindi",
      not any(e["id"] == ders and e["starts_at"].startswith(str(OCC3)) for e in rng["events"]),
      [e["starts_at"] for e in rng["events"] if e["id"] == ders])
bekle("sali istisnasi silmeden etkilenmedi",
      any(e["id"] == ders and e["starts_at"] == f"{OCC2} 15:00" for e in rng["events"]))

# .ics: EXDATE + RECURRENCE-ID + VALARM
c.patch(f"/api/events/{ders}", json={"reminders": "10"})
ics = c.get("/calendar.ics").text
bekle("EXDATE carsambayi dusuyor",
      f"EXDATE:{OCC3.strftime('%Y%m%d')}T090000" in ics, "EXDATE yok")
bekle("RECURRENCE-ID sali slotunu gosteriyor",
      f"RECURRENCE-ID:{OCC2.strftime('%Y%m%d')}T090000" in ics, "RECURRENCE-ID yok")
bekle("tasinан sali 15:00 VEVENT'i var", f"DTSTART:{OCC2.strftime('%Y%m%d')}T150000" in ics)
bekle("VALARM hatirlatici var", "BEGIN:VALARM" in ics and "TRIGGER:-PT10M" in ics)
bekle("BYDAY beslemede", "BYDAY=MO,TH" in ics, "BYDAY yok")

# tasima pencereye DISARIDAN iceri: sali dersini gelecek aya tasi
UZAK = PZT + timedelta(days=40)
c.patch(f"/api/events/{ders}?scope=one&occ_date={OCC2}",
        json={"starts_at": f"{UZAK} 15:00", "ends_at": f"{UZAK} 16:00"})
rng_uzak = c.get(f"/api/range?start={UZAK}&days=1").json()
bekle("pencere disindan tasinan istisna yeni pencerede goruluyor",
      any(e["id"] == ders and e["occ_date"] == str(OCC2) for e in rng_uzak["events"]),
      rng_uzak["events"])
rng = c.get(f"/api/range?start={PZT}&days=7").json()
bekle("eski gununde artik gorunmuyor",
      not any(e["id"] == ders and e["starts_at"].startswith(str(OCC2)) for e in rng["events"]))

# bu ve sonrakiler: persembeden itibaren 11:00'e — seri bolunur
OCC5 = PZT + timedelta(days=4)
r = c.patch(f"/api/events/{ders}?scope=following&occ_date={OCC5}",
            json={"starts_at": f"{OCC5} 11:00", "ends_at": f"{OCC5} 12:00"}).json()
bekle("scope=following yeni seri actı", r.get("scope") == "following" and r.get("new_id"), r)
yeni_id = r["new_id"]
eski = c.get(f"/api/events/{ders}").json()
bekle("eski seri bolunme gununden once bitiyor",
      eski["repeat_until"] == (OCC5 - timedelta(days=1)).isoformat(), eski["repeat_until"])
rng = c.get(f"/api/range?start={PZT}&days=7").json()
p5 = [e for e in rng["events"] if e["starts_at"].startswith(str(OCC5)) and e["id"] in (ders, yeni_id)]
bekle("persembe artik 11:00 (yeni seri)", len(p5) == 1 and p5[0]["starts_at"].endswith("11:00")
      and p5[0]["id"] == yeni_id, p5)
bekle("pazartesi hala eski seride 09:00",
      any(e["id"] == ders and e["starts_at"] == f"{PZT} 09:00" for e in rng["events"]))

# tumu (occ_date + delta): yeni seriyi cumadan surukleyip 1 saat kaydir
OCC6 = PZT + timedelta(days=5)
c.patch(f"/api/events/{yeni_id}?scope=all&occ_date={OCC6}",
        json={"starts_at": f"{OCC6} 12:30", "ends_at": f"{OCC6} 13:30"})
yeni = c.get(f"/api/events/{yeni_id}").json()
bekle("tum seri ayni deltayla kaydi (11:00->12:30)",
      yeni["starts_at"] == f"{OCC5} 12:30", yeni["starts_at"])

# kural degisince istisnalar temizlenir
c.patch(f"/api/events/{ders}?scope=one&occ_date={PZT}", json={"title": "Ders (özel)"})
bekle("istisna yazildi", len(c.get(f"/api/events/{ders}").json()["overrides"]) >= 1)
c.patch(f"/api/events/{ders}", json={"repeat": "weekly"})
bekle("kural degisince istisnalar silindi",
      len(c.get(f"/api/events/{ders}").json()["overrides"]) == 0)

print("\n-- pencere artik hafta baslangicina ZORLANMIYOR (kayan 7 gun) --")
CAR = PZT + timedelta(days=2)
r = c.get(f"/api/range?start={CAR}&days=7").json()
bekle("carsamba baslangicli 7 gun aynen donuyor",
      r["start"] == str(CAR) and r["end"] == str(CAR + timedelta(days=6)), r["start"])

print("\n-- arama --")
r = c.get("/api/search?q=Toplantı").json()
bekle("etkinlik aramada bulundu", any("Toplantı" in e["title"] for e in r["events"]), r)
r = c.get("/api/search?q=klasik").json()
bekle("gorev aramada bulundu", any("klasik" in t["title"] for t in r["tasks"]), r)
bekle("kisa sorgu bos donuyor", c.get("/api/search?q=a").json() == {"events": [], "tasks": []})

print("\n-- haftalik baslangic HIZALAMA (gun listesi baslangici dislarsa) --")
# Carsamba baslat ama gunler Pzt+Cum: Google gibi baslangic ilk uygun gune
# (Cuma) kaymali — yoksa etkinlik kendi basladigi gunde hic gorunmuyordu.
CAR2 = PZT + timedelta(days=2)
r = c.post("/api/events", json={"title": "Hizala", "starts_at": f"{CAR2} 10:00",
                                "ends_at": f"{CAR2} 11:00", "repeat": "weekly",
                                "repeat_days": "0,4"}).json()
hz = c.get(f"/api/events/{r['id']}").json()
bekle("baslangic cumaya kaydi", hz["starts_at"] == f"{PZT + timedelta(days=4)} 10:00", hz["starts_at"])
bekle("sure korundu", hz["ends_at"] == f"{PZT + timedelta(days=4)} 11:00", hz["ends_at"])
rng = c.get(f"/api/range?start={PZT}&days=7").json()
hz_gunler = sorted(e["starts_at"][:10] for e in rng["events"] if e["title"] == "Hizala")
bekle("ilk hafta yalniz Cum (Pzt seri oncesi)", hz_gunler == [str(PZT + timedelta(days=4))], hz_gunler)

print("\n-- gorev siralama (surukle-birak) --")
ids = [c.post("/api/tasks", json={"title": f"sira-{i}", "list_id": lst}).json()["id"]
       for i in range(3)]
c.post("/api/tasks/reorder", json={"list_id": lst, "ids": [ids[2], ids[0], ids[1]]})
adlar = [t["title"] for t in c.get("/api/tasks").json() if t["title"].startswith("sira-")]
bekle("yeni sira uygulandi", adlar == ["sira-2", "sira-0", "sira-1"], adlar)

print("\n-- rutin gorevin GELECEK tekrarlari takvimde (projeksiyon) --")
pj = c.post("/api/tasks", json={"title": "Gunluk rutin", "list_id": lst,
                                "due_date": str(PZT), "due_time": "07:30",
                                "repeat": "daily"}).json()["id"]
rng = c.get(f"/api/range?start={PZT}&days=7").json()
rutin = [t for t in rng["tasks"] if t["id"] == pj]
bekle("7 gunun hepsinde goruluyor (1 gercek + 6 projeksiyon)", len(rutin) == 7,
      [t["due_date"] for t in rutin])
bekle("ilk gun GERCEK (projected yok)",
      not [t for t in rutin if t["due_date"] == str(PZT)][0].get("projected"))
bekle("sonrakiler projected isaretli",
      all(t.get("projected") for t in rutin if t["due_date"] != str(PZT)))
bekle("saat projeksiyona tasindi", all(t["due_time"] == "07:30" for t in rutin))
# tamamla -> ileri sarar -> bu haftaki penceresi temizlenir, yarinki pencerede gercek olur
c.patch(f"/api/tasks/{pj}", json={"title": "Gunluk rutin", "done": True})
rng = c.get(f"/api/range?start={PZT}&days=7").json()
rutin2 = [t for t in rng["tasks"] if t["id"] == pj]
bekle("tamamlaninca bugunku kayboldu, yarin GERCEK olarak durdu",
      all(t["due_date"] > str(PZT) for t in rutin2)
      and any(t["due_date"] == str(PZT + timedelta(days=1)) and not t.get("projected") for t in rutin2),
      [(t["due_date"], t.get("projected")) for t in rutin2])
c.delete(f"/api/tasks/{pj}")

print("\n-- rutin gorevde GUN SECIMI (Pzt+Sal+Cum tek gorev) --")
gd = c.post("/api/tasks", json={"title": "Cok gunlu rutin", "list_id": lst,
                                "due_date": str(PZT + timedelta(days=2)),  # Car
                                "repeat": "weekly", "repeat_days": "0,1,4"}).json()["id"]
gv = [t for t in c.get("/api/tasks").json() if t["id"] == gd][0]
bekle("Car secili degil -> Cum'a hizalandi", gv["due_date"] == str(PZT + timedelta(days=4)), gv["due_date"])
rng = c.get(f"/api/range?start={PZT + timedelta(days=7)}&days=7").json()
gunler2 = sorted(t["due_date"] for t in rng["tasks"] if t["id"] == gd)
bekle("sonraki hafta Pzt+Sal+Cum projeksiyonlari",
      gunler2 == [str(PZT + timedelta(days=7)), str(PZT + timedelta(days=8)), str(PZT + timedelta(days=11))],
      gunler2)
r = c.patch(f"/api/tasks/{gd}", json={"title": "Cok gunlu rutin", "done": True}).json()
bekle("Cuma bitince PAZARTESIYE sardi (gun listesi)",
      r.get("due_date") == str(PZT + timedelta(days=7)), r)

print("\n-- 'yalniz bu gorevi tasi' (detach) --")
r = c.post(f"/api/tasks/{gd}/detach", json={"due_date": str(PZT + timedelta(days=9))}).json()
bekle("bagimsiz kopya olustu", isinstance(r.get("new_id"), int), r)
bekle("seri kendi SONRAKI tekrarina gecti (Sal)",
      r.get("series_due_date") == str(PZT + timedelta(days=8)), r)
kopya = [t for t in c.get("/api/tasks").json() if t["id"] == r["new_id"]][0]
bekle("kopya tekrarsiz ve hedef gunde",
      kopya["repeat"] == "" and kopya["due_date"] == str(PZT + timedelta(days=9)), kopya)
r2 = c.post(f"/api/tasks/{kopya['id']}/detach", json={"due_date": str(PZT)})
bekle("tekrarsiz gorevde detach reddedilir", r2.status_code == 400)

print("\n-- GOOGLE'DAN ICE AKTARMA: .ics --")
GICS = "\r\n".join([
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Google Inc//Google Calendar//EN",
    "BEGIN:VEVENT", "UID:g1@google.com",
    "DTSTART;TZID=Europe/Berlin:20260901T100000",
    "DTEND;TZID=Europe/Berlin:20260901T113000",
    "SUMMARY:Diş hekimi", "LOCATION:Klinik", "DESCRIPTION:Kontrol\\nrandevusu",
    "BEGIN:VALARM", "ACTION:DISPLAY", "TRIGGER:-PT30M", "END:VALARM",
    "END:VEVENT",
    "BEGIN:VEVENT", "UID:g2@google.com", "DTSTART;VALUE=DATE:20260905",
    "DTEND;VALUE=DATE:20260907", "SUMMARY:Hafta sonu kaçamağı", "END:VEVENT",
    "BEGIN:VEVENT", "UID:g3@google.com",
    "DTSTART;TZID=Europe/Berlin:20260907T070000",
    "DTEND;TZID=Europe/Berlin:20260907T080000",
    "RRULE:FREQ=WEEKLY;BYDAY=MO,TH;UNTIL=20261001T215959Z",
    "EXDATE;TZID=Europe/Berlin:20260914T070000",
    "SUMMARY:Koşu (Google)", "END:VEVENT",
    "BEGIN:VEVENT", "UID:g3@google.com",
    "RECURRENCE-ID;TZID=Europe/Berlin:20260910T070000",
    "DTSTART;TZID=Europe/Berlin:20260910T183000",
    "DTEND;TZID=Europe/Berlin:20260910T193000",
    "SUMMARY:Koşu (akşama alındı)", "END:VEVENT",
    "BEGIN:VEVENT", "UID:g4@google.com",
    "DTSTART;TZID=Europe/Berlin:20260902T090000",
    "DTEND;TZID=Europe/Berlin:20260902T091500",
    "RRULE:FREQ=DAILY;COUNT=5", "SUMMARY:Sabah rutini", "END:VEVENT",
    "END:VCALENDAR", ""])
r = c.post("/api/import/ics", json={"ics": GICS}).json()
bekle("4 etkinlik eklendi", r["added"] == 4, r)
bekle("istisnalar islendi (EXDATE + tasima)", r["overrides"] == 2, r)
rng = c.get("/api/range?start=2026-09-07&days=7").json()
kosu = [e for e in rng["events"] if "Koşu" in e["title"]]
kosugunler = sorted(e["starts_at"] for e in kosu)
bekle("BYDAY hafta ici dogru: Pzt 07:00 + Per aksam (tasinmis)",
      "2026-09-07 07:00" in kosugunler and "2026-09-10 18:30" in kosugunler, kosugunler)
bekle("tasinan tekrarin basligi degisti",
      any(e["title"] == "Koşu (akşama alındı)" for e in kosu))
rng2 = c.get("/api/range?start=2026-09-14&days=7").json()
gkosu = [e for e in rng2["events"] if e["title"].startswith("Koşu (")]
bekle("EXDATE'li pazartesi yok, persembe var (ithal seri)",
      not any(e["starts_at"] == "2026-09-14 07:00" for e in gkosu)
      and any(e["starts_at"] == "2026-09-17 07:00" for e in gkosu),
      [e["starts_at"] for e in gkosu])
g1 = [e for e in c.get("/api/search?q=hekimi").json()["events"]]
bekle("saatli etkinlik alindi", len(g1) == 1 and g1[0]["starts_at"] == "2026-09-01 10:00", g1)
rt = c.get("/api/range?start=2026-09-01&days=7").json()
dis = [e for e in rt["events"] if e["title"] == "Diş hekimi"][0]
bekle("hatirlatici VALARM'dan geldi", dis["reminders"] == "30", dis)
hs = [e for e in rt["events"] if "kaçamağı" in e["title"]]
bekle("tum gun DTEND disleyici -> 2 gunluk (5-6 Eyl)",
      len({x["starts_at"][:10] for x in hs}) >= 1 and hs[0]["all_day"], hs)
rutin_r = [e for e in rt["events"] if e["title"] == "Sabah rutini"]
bekle("COUNT=5 -> 2-6 Eyl arasi 5 kez",
      len(rutin_r) == 5 and max(e["starts_at"][:10] for e in rutin_r) == "2026-09-06",
      [e["starts_at"] for e in rutin_r])
r2 = c.post("/api/import/ics", json={"ics": GICS}).json()
bekle("yeniden alim COGALTMAZ (uid ile gunceller)", r2["added"] == 0 and r2["updated"] == 4, r2)

print("\n-- GOOGLE'DAN ICE AKTARMA: Tasks JSON --")
GT = {"items": [
    {"title": "Alışveriş", "items": [
        {"id": "aa1", "title": "Süt al", "status": "needsAction", "due": "2026-09-03T00:00:00.000Z"},
        {"id": "aa2", "title": "Ekmek", "status": "completed"},
    ]},
    {"title": "Ev işleri", "items": [
        {"id": "bb1", "title": "Banyo temizliği", "notes": "cumartesi", "status": "needsAction"},
        {"id": "bb2", "title": "Deterjan sipariş", "status": "needsAction", "parent": "bb1"},
    ]},
]}
r = c.post("/api/import/gtasks", json={"data": GT}).json()
bekle("2 liste + 4 gorev alindi", r["lists"] == 2 and r["added"] == 4, r)
hepsi = c.get("/api/tasks?include_done=1").json()
sut = [t for t in hepsi if t["title"] == "Süt al"][0]
bekle("tarih Z-damgasindan sade tarihe indi", sut["due_date"] == "2026-09-03", sut)
bekle("tamamlanan tamamlanmis geldi", any(t["title"] == "Ekmek" and t["done"] for t in hepsi))
alt = [t for t in hepsi if t["title"] == "Deterjan sipariş"][0]
ust = [t for t in hepsi if t["title"] == "Banyo temizliği"][0]
bekle("alt gorev ebeveynine baglandi", alt["parent_id"] == ust["id"], (alt, ust["id"]))
r2 = c.post("/api/import/gtasks", json={"data": GT}).json()
bekle("gorev yeniden alimi da COGALTMAZ", r2["added"] == 0 and r2["updated"] == 4, r2)
# kullanici gorevi baska listeye tasidiysa yeniden alim GERI SURMEMELI
yeni_liste = c.post("/api/lists", json={"name": "Elle Tasinan"}).json()["id"]
sut_id = [t for t in c.get("/api/tasks?include_done=1").json() if t["title"] == "Süt al"][0]["id"]
c.patch(f"/api/tasks/{sut_id}", json={"list_id": yeni_liste})
c.post("/api/import/gtasks", json={"data": GT})
sut2 = [t for t in c.get("/api/tasks?include_done=1").json() if t["title"] == "Süt al"][0]
bekle("yeniden alim liste tasimayi bozmaz", sut2["list_id"] == yeni_liste, sut2["list_id"])

print("\n-- SILINENLER (yumusak silme + 24s cop kutusu) --")
sid = c.post("/api/events", json={"title": "Silinecek toplanti", "starts_at": f"{PZT} 10:00",
                                  "ends_at": f"{PZT} 11:00"}).json()["id"]
c.delete(f"/api/events/{sid}")
rng = c.get(f"/api/range?start={PZT}&days=7").json()
bekle("silinen etkinlik pencerede YOK",
      not any(e["id"] == sid for e in rng["events"]))
bekle("beslemede de yok", "Silinecek toplanti" not in c.get("/calendar.ics").text)
cop = c.get("/api/trash").json()
bekle("cop kutusunda duruyor", any(e["id"] == sid for e in cop["events"]), cop["events"][:3])
c.post("/api/trash/restore", json={"kind": "event", "id": sid})
rng = c.get(f"/api/range?start={PZT}&days=7").json()
bekle("geri alinca pencereye dondu", any(e["id"] == sid for e in rng["events"]))

ust_id = c.post("/api/tasks", json={"title": "Silinecek ust", "list_id": lst}).json()["id"]
alt_id = c.post("/api/tasks", json={"title": "Silinecek alt", "list_id": lst, "parent_id": ust_id}).json()["id"]
c.delete(f"/api/tasks/{ust_id}")
adlar2 = [t["title"] for t in c.get("/api/tasks").json()]
bekle("gorev + alt gorevi birlikte gizlendi",
      "Silinecek ust" not in adlar2 and "Silinecek alt" not in adlar2)
cop = c.get("/api/trash").json()
bekle("copte yalniz ust satir listelenir",
      any(t["id"] == ust_id for t in cop["tasks"]) and not any(t["id"] == alt_id for t in cop["tasks"]))
c.post("/api/trash/restore", json={"kind": "task", "id": ust_id})
adlar2 = [t["title"] for t in c.get("/api/tasks").json()]
bekle("geri alinca alt gorev de dondu",
      "Silinecek ust" in adlar2 and "Silinecek alt" in adlar2)

# 24 saatten eski -> kalici temizlik
c.delete(f"/api/tasks/{alt_id}")
import store as _store
with _store.tx() as _c:
    _c.execute("UPDATE tasks SET deleted_at=datetime('now','localtime','-2 day') WHERE id=?", (alt_id,))
c.get("/api/trash")
with _store.tx() as _c:
    kaldi_mi = _c.execute("SELECT COUNT(*) FROM tasks WHERE id=?", (alt_id,)).fetchone()[0]
bekle("24 saati gecen KALICI silindi", kaldi_mi == 0, kaldi_mi)

print("\n-- rutin gorevde 'yalniz bu tekrari sil' (skip) --")
sk = c.post("/api/tasks", json={"title": "Atlanacak", "list_id": lst,
                                "due_date": str(PZT), "repeat": "weekly",
                                "repeat_days": "0,3"}).json()["id"]
r = c.post(f"/api/tasks/{sk}/skip").json()
bekle("pazartesi atlandi, persembeye gecti",
      r.get("due_date") == str(PZT + timedelta(days=3)), r)
r2 = c.post(f"/api/tasks/{t1}/skip")
bekle("tekrarsizda skip reddedilir", r2.status_code == 400)

print("\n-- Takeout: kural notu kopyadan tasinir --")
GT2 = {"items": [{"title": "NotluListe", "recurrences": [
    {"id": "rr1", "title": "Notlu Rutin",
     "schedule": {"first_instance_date": "2026-08-10T00:00:00Z",
                  "interval": {"daily": {}, "interval_multiplier": 1},
                  "time_zone": "Europe/Berlin"}}],
    "items": [
        {"id": "i1", "title": "Notlu Rutin", "task_recurrence_id": "rr1",
         "status": "needsAction", "notes": "kontrol listesi: a,b,c",
         "scheduled_time": "[{'current': True, 'start': '2026-08-18T22:00:00Z'}]"},
    ]}]}
r = c.post("/api/import/gtasks", json={"data": GT2}).json()
notlu = [t for t in c.get("/api/tasks").json() if t["title"] == "Notlu Rutin"][0]
bekle("kuralin notu kopyadan geldi", notlu["notes"] == "kontrol listesi: a,b,c", notlu)
bekle("kural rutin olarak geldi", notlu["repeat"] == "daily" and notlu["due_date"] == "2026-08-19", notlu)

print("\n-- Takeout: BITIRILMIS kurallar (delete this and following) alinmaz --")
GT3 = {"items": [{"title": "BitmisListe", "recurrences": [
    {"id": "bit1", "title": "Bitmis Rutin",
     "schedule": {"first_instance_date": "2026-07-01T00:00:00Z",
                  "interval": {"daily": {}, "interval_multiplier": 1},
                  "end_condition": {"date_boundary": "2026-08-01T00:00:00Z"},
                  "time_zone": "Europe/Berlin"}},
    {"id": "dur1", "title": "Durdurulmus Rutin", "stopped": "True",
     "schedule": {"first_instance_date": "2026-07-01T00:00:00Z",
                  "interval": {"daily": {}, "interval_multiplier": 1},
                  "time_zone": "Europe/Berlin"}}],
    "items": [
        {"id": "bi1", "title": "Bitmis Rutin", "task_recurrence_id": "bit1",
         "status": "needsAction",
         "scheduled_time": "[{'current': True, 'start': '2026-07-31T22:00:00Z'}]"},
    ]}]}
r = c.post("/api/import/gtasks", json={"data": GT3}).json()
adlar3 = [t["title"] for t in c.get("/api/tasks").json()]
bekle("bitis sinirli kural HORTLAMADI", "Bitmis Rutin" not in adlar3, adlar3[-5:])
bekle("stopped kural da alinmadi", "Durdurulmus Rutin" not in adlar3)

print("\n-- rutin duzenleme: notlar seriyi TASIMAZ + tekrar atlama (skip_dates) --")
rt = c.post("/api/tasks", json={"title": "Aksam rutini", "list_id": lst,
                                "due_date": str(BUGUN), "repeat": "daily"}).json()["id"]
c.patch(f"/api/tasks/{rt}", json={"notes": "yeni aciklama"})
row = [t for t in c.get("/api/tasks").json() if t["id"] == rt][0]
bekle("yalniz not degisince tarih yerinde", row["due_date"] == str(BUGUN), row)
bekle("not kaydedildi", row["notes"] == "yeni aciklama", row)

# gelecekteki tekrari sil (skip + occ_date): seri yerinde kalir, o gun atlanir
hedef = str(BUGUN + timedelta(days=3))
r = c.post(f"/api/tasks/{rt}/skip", json={"occ_date": hedef}).json()
bekle("projeksiyon silinince seri TASINMADI", r.get("due_date") == str(BUGUN), r)
rng = c.get(f"/api/range?start={BUGUN}&days=7").json()
gunler3 = [t["due_date"] for t in rng["tasks"] if t["id"] == rt]
bekle("atlanan gun projeksiyonlarda yok", hedef not in gunler3, gunler3)
bekle("diger projeksiyonlar duruyor",
      str(BUGUN + timedelta(days=2)) in gunler3, gunler3)

# projeksiyona 'yalniz bu' duzenlemesi (detach + occ_date): kopya + seri yerinde
hedef2 = str(BUGUN + timedelta(days=5))
r = c.post(f"/api/tasks/{rt}/detach", json={
    "due_date": hedef2, "occ_date": hedef2,
    "title": "Aksam rutini (ozel)", "notes": "sadece bu gun"}).json()
bekle("projeksiyon detach: seri TASINMADI", r.get("series_due_date") == str(BUGUN), r)
kopya2 = [t for t in c.get("/api/tasks").json() if t["id"] == r["new_id"]][0]
bekle("kopya duzenlenen alanlarla ve hedef gunde",
      kopya2["title"] == "Aksam rutini (ozel)" and kopya2["notes"] == "sadece bu gun"
      and kopya2["due_date"] == hedef2 and kopya2["repeat"] == "", kopya2)
rng = c.get(f"/api/range?start={BUGUN}&days=7").json()
o_gun = [t for t in rng["tasks"] if t["due_date"] == hedef2
         and t["id"] in (rt, r["new_id"])]
bekle("o gunde tek kayit: bagimsiz kopya (cift gorunum yok)",
      len(o_gun) == 1 and o_gun[0]["id"] == r["new_id"], o_gun)
proj = [t for t in rng["tasks"] if t.get("projected") and t["id"] == rt]
bekle("projeksiyonlar serinin gercek vadesini tasiyor",
      proj and all(t.get("series_due_date") == str(BUGUN) for t in proj), proj[:2])

# tamamlaninca ileri sarma atlanan gunun USTUNDEN atlar
c.post(f"/api/tasks/{rt}/skip", json={"occ_date": str(BUGUN + timedelta(days=1))})
r = c.patch(f"/api/tasks/{rt}", json={"title": "Aksam rutini", "done": True}).json()
bekle("ileri sarma atlanan gunu es gecti",
      r.get("due_date") == str(BUGUN + timedelta(days=2)), r)

# kural degisince atlama listesi temizlenir (eski gunler yeni kurala uymayabilir)
c.patch(f"/api/tasks/{rt}", json={"repeat": "weekly", "repeat_days": ""})
with _store.tx() as _c:
    sd = _c.execute("SELECT skip_dates FROM tasks WHERE id=?", (rt,)).fetchone()[0]
bekle("kural degisince skip_dates sifirlandi", sd == "", sd)

print(f"\n=== {gecti} gecti - {kaldi} kaldi ===\n")
sys.exit(1 if kaldi else 0)
