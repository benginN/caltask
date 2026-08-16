"""recur.expand() sinamalari.

En kritik kisim "pencereye atlama" optimizasyonu: uzun sureli bir seride
basindan itibaren yurumek yerine pencereye yakin bir n'den basliyoruz.
Klasik hata kaynagi — bu yuzden her kural icin KABA KUVVET referansiyla
karsilastiriliyor (atlamasiz, bastan yuruyen basit surum).
"""
import sys
from datetime import date, datetime, timedelta

sys.path.insert(0, "app")
import recur  # noqa: E402


def brute(starts, ends, rule, every, until, wf, wt, limit=5000):
    """Atlamasiz referans: seri basindan itibaren tek tek yuru."""
    out = []
    dur = ends - starts
    if not rule:
        if starts.date() <= wt and ends.date() >= wf:
            out.append((starts, starts + dur))
        return out
    for n in range(limit):
        s = recur._step(starts, rule, every, n)
        if s.date() > wt or (until and s.date() > until):
            break
        e = s + dur
        if e.date() >= wf:
            out.append((s, e))
    return out


gecti = kaldi = 0


def bekle(ad, kosul, ipucu=""):
    global gecti, kaldi
    if kosul:
        gecti += 1
        print(f"  OK   {ad}")
    else:
        kaldi += 1
        print(f"  YOK  {ad}" + (f"\n         -> {ipucu}" if ipucu else ""))


print("\n-- tekrarsiz --")
s = datetime(2026, 8, 18, 10, 0)
e = datetime(2026, 8, 18, 11, 0)
bekle("pencere icinde 1 kez",
      len(list(recur.expand(s, e, "", 1, None, date(2026, 8, 16), date(2026, 8, 22)))) == 1)
bekle("pencere disinda hic",
      len(list(recur.expand(s, e, "", 1, None, date(2026, 9, 1), date(2026, 9, 7)))) == 0)
bekle("cok gunlu etkinlik pencereye tasiyorsa yakalanir",
      len(list(recur.expand(datetime(2026, 8, 14), datetime(2026, 8, 20), "", 1, None,
                            date(2026, 8, 16), date(2026, 8, 22)))) == 1)

print("\n-- atlama optimizasyonu kaba kuvvetle ayni mi --")
senaryolar = [
    ("gunluk her gun",      datetime(2020, 1, 1, 9, 0),  "daily",   1),
    ("gunluk 3 gunde bir",  datetime(2020, 1, 1, 9, 0),  "daily",   3),
    ("haftalik",            datetime(2019, 3, 5, 14, 0), "weekly",  1),
    ("haftalik 2 haftada",  datetime(2019, 3, 5, 14, 0), "weekly",  2),
    ("aylik",               datetime(2018, 1, 15, 8, 0), "monthly", 1),
    ("aylik 3 ayda bir",    datetime(2018, 1, 15, 8, 0), "monthly", 3),
    ("yillik",              datetime(2015, 6, 9, 12, 0), "yearly",  1),
    ("aylik ayin 31'i",     datetime(2024, 1, 31, 9, 0), "monthly", 1),
]
pencereler = [
    (date(2026, 8, 16), date(2026, 8, 22)),
    (date(2026, 2, 23), date(2026, 3, 1)),
    (date(2026, 12, 28), date(2027, 1, 3)),
    (date(2020, 1, 1), date(2020, 1, 7)),      # serinin ta basi
]
for ad, bas, kural, aralik in senaryolar:
    for wf, wt in pencereler:
        bit = bas + timedelta(hours=1)
        hizli = list(recur.expand(bas, bit, kural, aralik, None, wf, wt))
        yavas = brute(bas, bit, kural, aralik, None, wf, wt)
        bekle(f"{ad} | {wf}..{wt}", hizli == yavas,
              f"hizli={[x[0].isoformat() for x in hizli]} yavas={[x[0].isoformat() for x in yavas]}")

print("\n-- bitis tarihi (until) --")
bas = datetime(2026, 8, 3, 9, 0)
bit = bas + timedelta(hours=1)
r = list(recur.expand(bas, bit, "weekly", 1, date(2026, 8, 17), date(2026, 8, 16), date(2026, 8, 22)))
bekle("until'den sonrasi uretilmiyor", len(r) == 1 and r[0][0].date() == date(2026, 8, 17),
      str([x[0].isoformat() for x in r]))
r = list(recur.expand(bas, bit, "weekly", 1, date(2026, 8, 10), date(2026, 8, 16), date(2026, 8, 22)))
bekle("until pencereden onceyse hic uretmiyor", len(r) == 0, str(r))

print("\n-- ayin 31'i kirpma --")
r = list(recur.expand(datetime(2024, 1, 31, 9, 0), datetime(2024, 1, 31, 10, 0),
                      "monthly", 1, None, date(2024, 2, 1), date(2024, 2, 29)))
bekle("31 Ocak + 1 ay -> 29 Subat (atlanmiyor)",
      len(r) == 1 and r[0][0].date() == date(2024, 2, 29), str([x[0].isoformat() for x in r]))

print("\n-- guvenlik tavani --")
r = list(recur.expand(datetime(2026, 1, 1, 9, 0), datetime(2026, 1, 1, 10, 0),
                      "daily", 1, None, date(2026, 1, 1), date(2030, 1, 1)))
bekle("tavan asilmiyor", len(r) <= recur.MAX_OCCURRENCES, f"uretilen={len(r)}")

print("\n-- RRULE ciktisi --")
bekle("tekrarsiz bos", recur.to_rrule("", 1, None) == "")
bekle("gunluk", recur.to_rrule("daily", 1, None) == "FREQ=DAILY")
bekle("2 haftada bir", recur.to_rrule("weekly", 2, None) == "FREQ=WEEKLY;INTERVAL=2")
bekle("until", recur.to_rrule("monthly", 1, date(2026, 12, 31))
      == "FREQ=MONTHLY;UNTIL=20261231T235959")

print("\n-- haftalik BELIRLI GUNLER (BYDAY) kaba kuvvetle ayni mi --")


def brute_days(starts, ends, every, days, until, wf, wt):
    """Atlamasiz referans: seri haftasindan itibaren gun gun yuru (WKST=MO)."""
    out = []
    dur = ends - starts
    base_monday = starts.date() - timedelta(days=starts.date().weekday())
    d = base_monday
    while d <= wt:
        hafta_no = (d - base_monday).days // 7
        if (hafta_no % max(1, every)) == 0 and d.weekday() in days and d >= starts.date():
            if until and d > until:
                break
            s = datetime(d.year, d.month, d.day, starts.hour, starts.minute)
            e = s + dur
            if e.date() >= wf:
                out.append((s, e))
        d += timedelta(days=1)
    return out


gun_senaryolari = [
    ("pzt+car",        datetime(2026, 8, 3, 9, 0),  1, [0, 2]),
    ("sal+per+cmt",    datetime(2026, 8, 4, 14, 0), 1, [1, 3, 5]),
    ("2 haftada pzt",  datetime(2026, 7, 6, 8, 0),  2, [0]),
    ("2 haftada c+cm", datetime(2026, 7, 8, 8, 0),  2, [2, 5]),
    # seri carsamba baslar ama gunler pzt+cum: ilk hafta pzt seriden ONCE,
    # uretilmemeli — klasik RFC tuzagi
    ("bas gunu listede yok", datetime(2026, 8, 5, 10, 0), 1, [0, 4]),
]
gun_pencereleri = [
    (date(2026, 8, 16), date(2026, 8, 22)),
    (date(2026, 8, 3), date(2026, 8, 9)),        # serinin ilk haftasi
    (date(2027, 3, 1), date(2027, 3, 14)),       # cok sonrasi (atlama yolu)
]
for ad, bas, aralik, gunler in gun_senaryolari:
    for wf, wt in gun_pencereleri:
        bit = bas + timedelta(hours=1)
        hizli = list(recur.expand(bas, bit, "weekly", aralik, None, wf, wt, gunler))
        yavas = brute_days(bas, bit, aralik, gunler, None, wf, wt)
        bekle(f"{ad} | {wf}..{wt}", hizli == yavas,
              f"hizli={[x[0].isoformat() for x in hizli]} yavas={[x[0].isoformat() for x in yavas]}")

r = list(recur.expand(datetime(2026, 8, 3, 9, 0), datetime(2026, 8, 3, 10, 0),
                      "weekly", 1, date(2026, 8, 18), date(2026, 8, 16), date(2026, 8, 30), [0, 2]))
bekle("BYDAY + until birlikte", [x[0].date() for x in r] == [date(2026, 8, 17)],
      str([x[0].isoformat() for x in r]))

print("\n-- gun listesi ayristirma --")
bekle("normal", recur.parse_days("0,2,4") == [0, 2, 4])
bekle("cop atiliyor", recur.parse_days("7,abc,-1,3,3") == [3])
bekle("bos", recur.parse_days("") == [] and recur.parse_days(None) == [])

print("\n-- RRULE BYDAY ciktisi --")
bekle("pzt+car", recur.to_rrule("weekly", 1, None, [0, 2]) == "FREQ=WEEKLY;BYDAY=MO,WE;WKST=MO")
bekle("aralikli + gunler + until",
      recur.to_rrule("weekly", 2, date(2026, 12, 31), [4])
      == "FREQ=WEEKLY;INTERVAL=2;BYDAY=FR;WKST=MO;UNTIL=20261231T235959")
bekle("gunler yalniz weekly'de", "BYDAY" not in recur.to_rrule("daily", 1, None, [0]))

print("\n-- tekrarlayan gorevin sonraki tarihi --")
bekle("gunluk", recur.next_due(date(2026, 8, 16), "daily", 1) == date(2026, 8, 17))
bekle("haftalik", recur.next_due(date(2026, 8, 16), "weekly", 1) == date(2026, 8, 23))
bekle("aylik 31 -> kirpma", recur.next_due(date(2026, 1, 31), "monthly", 1) == date(2026, 2, 28))
bekle("tekrarsiz None", recur.next_due(date(2026, 8, 16), "", 1) is None)

print("\n-- next_due GUN LISTESIYLE (rutin gorev: Pzt+Sal+Cum) --")
# 18 Agu 2026 = Sali. Gunler Pzt(0)+Sal(1)+Cum(4).
bekle("Sali bitince Cuma", recur.next_due(date(2026, 8, 18), "weekly", 1, [0, 1, 4]) == date(2026, 8, 21))
bekle("Cuma bitince pazartesi", recur.next_due(date(2026, 8, 21), "weekly", 1, [0, 1, 4]) == date(2026, 8, 24))
bekle("2 haftada bir: Cuma bitince obur haftanin Pzt'si",
      recur.next_due(date(2026, 8, 21), "weekly", 2, [0, 4]) == date(2026, 8, 31),
      recur.next_due(date(2026, 8, 21), "weekly", 2, [0, 4]))

print(f"\n=== {gecti} gecti - {kaldi} kaldi ===\n")
sys.exit(1 if kaldi else 0)
