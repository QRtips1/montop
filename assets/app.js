/* MonTop: park page logic shared by every park. No framework. */
(function () {
  "use strict";
  var D = window.MT_DATA, I = window.MT_I18N, P = window.MT_PARK || {}, S = {};
  Object.keys(window.MT_SEASONS).forEach(function (k) { S[k] = window.MT_SEASONS[k]; });
  Object.keys(P.seasons || {}).forEach(function (k) {
    if (k === "gear") Object.keys(P.seasons.gear).forEach(function (s) { S.gear[s] = Object.assign({}, S.gear[s], P.seasons.gear[s]); });
    else S[k] = P.seasons[k];
  });
  Object.keys(P.i18n || {}).forEach(function (l) { if (I[l]) Object.keys(P.i18n[l]).forEach(function (k) { I[l][k] = P.i18n[l][k]; }); });
  var ZAB = P.wx || { lat: D.center[0], lon: D.center[1] };
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };
  var reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };

  /* ---------- language ---------- */
  function detectLang() {
    var q = (location.search.match(/[?&]lang=(me|en|ru)\b/) || [])[1];
    if (q) { store.set("mt-lang", q); return q; }
    var saved = store.get("mt-lang");
    if (saved && I[saved]) return saved;
    var langs = navigator.languages || [navigator.language || "en"];
    for (var i = 0; i < langs.length; i++) {
      var l = (langs[i] || "").toLowerCase();
      if (/^(sr|cnr|hr|bs|me)\b/.test(l)) return "me";
      if (/^ru\b/.test(l)) return "ru";
      if (/^en\b/.test(l)) return "en";
    }
    return "en";
  }
  var lang = detectLang();
  function t(k) { return (I[lang] && I[lang][k] != null) ? I[lang][k] : (I.en[k] != null ? I.en[k] : k); }
  function L(o) { return o ? (o[lang] != null ? o[lang] : o.en) : ""; }

  /* ---------- season & time ---------- */
  var now = new Date();
  var PARK = document.documentElement.getAttribute("data-park");
  /* month in Montenegro (park time), not on the visitor's clock */
  var PM = (function () { try { return +new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Podgorica", month: "numeric" }).format(now) - 1; } catch (e) { return now.getMonth(); } })();
  var curSeason = S.byMonth[PM];
  var season = curSeason;
  var weather = null;

  /* ---------- live sky ----------
     Sun and moon positions follow suncalc (V. Agafonkin, BSD): computed from UTC for the park's own
     coordinates, so the light is the park's, whatever the visitor's clock says. */
  var VIEW = (function () { try { return JSON.parse($(".scene").getAttribute("data-view") || "{}"); } catch (e) { return {}; } })();
  var SKYLAT = VIEW.lat || ZAB.lat, SKYLON = VIEW.lon || ZAB.lon;
  var rad = Math.PI / 180, OBL = rad * 23.4397;
  function toDays(d) { return d.valueOf() / 864e5 - 0.5 + 2440588 - 2451545; }
  function ra(l, b) { return Math.atan2(Math.sin(l) * Math.cos(OBL) - Math.tan(b) * Math.sin(OBL), Math.cos(l)); }
  function dec(l, b) { return Math.asin(Math.sin(b) * Math.cos(OBL) + Math.cos(b) * Math.sin(OBL) * Math.sin(l)); }
  function azim(H, phi, d) { return Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(d) * Math.cos(phi)); }
  function alti(H, phi, d) { return Math.asin(Math.sin(phi) * Math.sin(d) + Math.cos(phi) * Math.cos(d) * Math.cos(H)); }
  function sidereal(d, lw) { return rad * (280.16 + 360.9856235 * d) - lw; }
  function sunCoords(d) {
    var M = rad * (357.5291 + 0.98560028 * d), C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
    var L = M + C + rad * 102.9372 + Math.PI; return { dec: dec(L, 0), ra: ra(L, 0) };
  }
  function moonCoords(d) {
    var L = rad * (218.316 + 13.176396 * d), M = rad * (134.963 + 13.064993 * d), F = rad * (93.272 + 13.229350 * d);
    var l = L + rad * 6.289 * Math.sin(M), b = rad * 5.128 * Math.sin(F);
    return { ra: ra(l, b), dec: dec(l, b), dist: 385001 - 20905 * Math.cos(M) };
  }
  function bodyPos(c, date) {  // compass azimuth (0 = north) and altitude, degrees
    var lw = rad * -SKYLON, phi = rad * SKYLAT, H = sidereal(toDays(date), lw) - c.ra;
    return { az: (azim(H, phi, c.dec) / rad + 180) % 360, alt: alti(H, phi, c.dec) / rad };
  }
  function sunAlt(date) { return bodyPos(sunCoords(toDays(date)), date).alt; }
  function moonIllum(date) {
    var d = toDays(date), s = sunCoords(d), m = moonCoords(d), sd = 149598000;
    var phi = Math.acos(Math.sin(s.dec) * Math.sin(m.dec) + Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(s.ra - m.ra));
    var inc = Math.atan2(sd * Math.sin(phi), m.dist - sd * Math.cos(phi));
    var ang = Math.atan2(Math.cos(s.dec) * Math.sin(s.ra - m.ra), Math.sin(s.dec) * Math.cos(m.dec) - Math.cos(s.dec) * Math.sin(m.dec) * Math.cos(s.ra - m.ra));
    return { frac: (1 + Math.cos(inc)) / 2, waxing: ang < 0 };
  }
  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function skylineAt(az) {  // elevation angle of the real ridge in this direction
    if (!VIEW.sky || az < VIEW.az0 || az > VIEW.az1) return null;
    return VIEW.sky[Math.round((az - VIEW.az0) * 2)];
  }
  var MODES = ["auto", "day", "night"];
  var mode = MODES.indexOf(store.get("mt-mode")) > -1 ? store.get("mt-mode") : "auto";
  var light = { sun: 30, wNight: 0, cloud: 0 };
  function wxNow() { return (season === curSeason && weather && weather.current) ? weather.current : null; }
  function setPhase() {
    var d = new Date(), root = document.documentElement, st = root.style;
    var sp = bodyPos(sunCoords(toDays(d)), d), mp = bodyPos(moonCoords(toDays(d)), d), mi = moonIllum(d);
    var a = mode === "day" ? 35 : mode === "night" ? -20 : sp.alt, evening = mode === "auto" ? sp.az > 180 : true;
    var c = wxNow(), cc = c ? c.cloud_cover : 25, code = c ? c.weather_code : 1, kind = c ? wKind(code) : "dry";
    var storm = c && code >= 95 ? 1 : 0, wet = kind === "rain" || kind === "snow" ? 1 : 0;
    var over = clamp01((cc - 55) / 45) * (wet ? 1 : .85);
    var wNight = clamp01((-3 - a) / 9), wBlue = clamp01(1 - Math.abs(a + 4.5) / 5) * (1 - wNight * .7);
    var wGlow = clamp01(1 - Math.abs(a - 1.5) / 6.5) * (1 - over * .75), wGold = clamp01(1 - Math.abs(a - 8) / 7) * (1 - over * .8);
    var moonUp = mp.alt > 0 && mode !== "day", moonLight = moonUp ? mi.frac * clamp01(mp.alt / 10) : 0;
    st.setProperty("--w-night", (wNight * (1 - moonLight * .18)).toFixed(3));
    st.setProperty("--w-blue", (wBlue * .95).toFixed(3));
    st.setProperty("--w-dawn", (evening ? 0 : wGlow * .9).toFixed(3));
    st.setProperty("--w-dusk", (evening ? wGlow * .9 : 0).toFixed(3));
    st.setProperty("--w-over", (over * (1 - wNight * .8) * .9).toFixed(3));
    st.setProperty("--w-storm", (storm * .75 * (1 - wNight * .7)).toFixed(3));
    st.setProperty("--w-cloud", (clamp01((cc - 15) / 70) * .95).toFixed(3));
    st.setProperty("--cloud-b", (wet ? .78 : 1) * (storm ? .8 : 1) + "");
    st.setProperty("--cloud-dur", Math.round(320 - Math.min(260, (c ? c.wind_speed_10m : 10) * 6)) + "s");
    // one multiply tint over the landscape: night blue, blue hour, warm glow, golden hour, dull overcast, storm
    var tint = [1, 1, 1];
    function mul(rgb, w) { for (var i = 0; i < 3; i++) tint[i] *= 1 - w + w * rgb[i] / 255; }
    mul([52, 70, 118], wNight * (.62 - moonLight * .14));
    mul([96, 110, 168], wBlue * .45);
    mul(evening ? [255, 150, 98] : [255, 178, 160], wGlow * .38);
    mul([255, 214, 160], wGold * .3);
    mul([150, 158, 166], over * .3);
    mul([92, 100, 112], storm * .32);
    st.setProperty("--tint", "rgb(" + tint.map(function (v) { return Math.round(v * 255); }).join(",") + ")");
    // the sun: a disc on the far ridge layer, so it really sets behind the mountains; its glow follows it
    var sunVis = mode === "auto" && sp.alt > -1.5 && sp.az > VIEW.az0 && sp.az < VIEW.az1 && cc < 88 && !wet;
    var orb = $(".sun-orb");
    if (orb && VIEW.az0 != null) {
      var ux = VIEW.W / (VIEW.az1 - VIEW.az0);
      orb.style.left = ((sp.az - VIEW.az0) / (VIEW.az1 - VIEW.az0) * 100).toFixed(2) + "%";
      orb.style.top = ((VIEW.hor - Math.max(-2, a) * ux * VIEW.ex) / VIEW.H * 100).toFixed(2) + "%";
    }
    root.setAttribute("data-sun", sunVis ? "1" : "0");
    var low = clamp01(1 - (a - 2) / 14);
    st.setProperty("--sun-core", a < 4 ? "#ffb070" : a < 12 ? "#ffe2a6" : "#fff8e4");
    st.setProperty("--glow", a < 4 ? "255, 150, 90" : a < 12 ? "255, 205, 130" : "255, 240, 205");
    st.setProperty("--sun-glow", ((mode === "night" ? 0 : 1) * (1 - over * .7) * (a < -6 ? 0 : 1)).toFixed(2));
    st.setProperty("--glow-op", (.35 + .3 * low).toFixed(2));
    // the moon: its real position and phase; shown only above the real ridge line
    var ridge = skylineAt(mp.az), mx = null;
    var moonVis = moonUp && mode === "auto" && ridge != null && mp.alt > ridge + .4 && cc < 85 && !wet;
    if (mode === "night") { moonVis = true; }
    root.setAttribute("data-moon", moonVis ? "1" : "0");
    if (moonVis) {
      var r = 1, k = Math.cos(Math.PI * mi.frac), lit = $(".moon .m-lit");  // terminator ellipse
      var f = mi.frac, sweepOuter = mi.waxing ? 1 : 0, rx = Math.abs(1 - 2 * f), sweepIn = (f > .5) === mi.waxing ? 1 : 0;
      if (lit) lit.setAttribute("d", "M0,-1 A1,1 0 0," + sweepOuter + " 0,1 A" + rx.toFixed(3) + ",1 0 0," + (sweepIn ? 1 : 0) + " 0,-1 Z");
      st.setProperty("--moon-op", (a > 0 ? .45 : .95).toFixed(2));
      mx = mode === "night" ? null : mp;
    }
    light = { sun: a, sunAz: sp.az, moon: mx, wNight: wNight, cloud: cc, storm: storm };
    placeSky();
    var ph = a < -6 ? "night" : a < 4 ? (evening ? "dusk" : "dawn") : "day";
    root.setAttribute("data-phase", ph);
    root.setAttribute("data-ink", ph === "day" && (storm || (wet && over > .8)) ? "light" : "");
    root.setAttribute("data-mode", mode);
    var mb = $("#mode-name"); if (mb) mb.textContent = t("mode." + mode);
    particles.retune();
    lightning(storm && mode !== "night");
  }
  // screen positions that depend on the far layer: the sun glow and the moon
  function placeSky() {
    var far = $(".l-far"), st = document.documentElement.style;
    if (!far || VIEW.az0 == null) return;
    var r = far.getBoundingClientRect(), R = VIEW.az1 - VIEW.az0, ux = VIEW.W / R;
    function at(az, alt) { return [r.left + (az - VIEW.az0) / R * r.width, r.top + (VIEW.hor - alt * ux * VIEW.ex) / VIEW.H * r.width / (VIEW.W / VIEW.H)]; }
    var s = at(Math.max(VIEW.az0 - 25, Math.min(VIEW.az1 + 25, light.sunAz || 200)), Math.max(-3, light.sun));
    st.setProperty("--sun-x", Math.round(s[0]) + "px"); st.setProperty("--sun-y", Math.round(s[1]) + "px");
    if (light.moon) { var m = at(light.moon.az, light.moon.alt); st.setProperty("--moon-x", Math.round(m[0]) + "px"); st.setProperty("--moon-y", Math.round(m[1]) + "px"); }
    else { st.removeProperty("--moon-x"); st.removeProperty("--moon-y"); }
  }
  // thunderstorm: a soft, rare flash and a thin far bolt; never on reduced motion
  var boltT = 0;
  function lightning(on) {
    clearTimeout(boltT);
    if (!on || reduced) return;
    boltT = setTimeout(function strike() {
      if (!document.hidden) {
        var fl = $(".flash"), bo = $(".bolt"), x = 15 + Math.random() * 70, y = 4, pts = [];
        document.documentElement.style.setProperty("--fx", x + "%");
        for (var i = 0; i < 9; i++) { pts.push((x + (Math.random() - .5) * 6 * (i ? 1 : 0)).toFixed(1) + "," + y.toFixed(1)); x += (Math.random() - .5) * 5; y += 6 + Math.random() * 6; }
        $(".bolt path").setAttribute("d", "M" + pts.join(" L"));
        var k = [{ opacity: 0 }, { opacity: .2, offset: .08 }, { opacity: .04, offset: .25 }, { opacity: .14, offset: .4 }, { opacity: 0 }];
        if (fl.animate) { fl.animate(k, { duration: 700, easing: "ease-out" }); if (Math.random() < .6) bo.animate([{ opacity: 0 }, { opacity: .55, offset: .08 }, { opacity: 0, offset: .3 }, { opacity: .35, offset: .42 }, { opacity: 0 }], { duration: 700 }); }
      }
      boltT = setTimeout(strike, 7000 + Math.random() * 14000);
    }, 2500 + Math.random() * 5000);
  }

  /* ---------- weather ---------- */
  var WMO = {
    0: ["Vedro", "Clear", "Ясно"], 1: ["Pretežno vedro", "Mostly clear", "Малооблачно"], 2: ["Djelimično oblačno", "Partly cloudy", "Переменная облачность"], 3: ["Oblačno", "Overcast", "Пасмурно"],
    45: ["Magla", "Fog", "Туман"], 48: ["Magla sa injem", "Freezing fog", "Изморозь и туман"],
    51: ["Sitna kiša", "Light drizzle", "Морось"], 53: ["Sitna kiša", "Drizzle", "Морось"], 55: ["Jaka sitna kiša", "Heavy drizzle", "Сильная морось"],
    56: ["Ledena kiša", "Freezing drizzle", "Ледяная морось"], 57: ["Ledena kiša", "Freezing drizzle", "Ледяная морось"],
    61: ["Slaba kiša", "Light rain", "Небольшой дождь"], 63: ["Kiša", "Rain", "Дождь"], 65: ["Jaka kiša", "Heavy rain", "Сильный дождь"],
    66: ["Ledena kiša", "Freezing rain", "Ледяной дождь"], 67: ["Ledena kiša", "Freezing rain", "Ледяной дождь"],
    71: ["Slab snijeg", "Light snow", "Небольшой снег"], 73: ["Snijeg", "Snow", "Снег"], 75: ["Jak snijeg", "Heavy snow", "Сильный снег"], 77: ["Snježna zrna", "Snow grains", "Снежная крупа"],
    80: ["Pljuskovi", "Showers", "Ливни"], 81: ["Pljuskovi", "Showers", "Ливни"], 82: ["Jaki pljuskovi", "Heavy showers", "Сильные ливни"],
    85: ["Snježni pljuskovi", "Snow showers", "Снегопад"], 86: ["Jaki snježni pljuskovi", "Heavy snow showers", "Сильный снегопад"],
    95: ["Grmljavina", "Thunderstorm", "Гроза"], 96: ["Grmljavina sa gradom", "Thunderstorm, hail", "Гроза с градом"], 99: ["Grmljavina sa gradom", "Thunderstorm, hail", "Гроза с градом"]
  };
  function wLabel(code) { var w = WMO[code] || WMO[3]; return w[{ me: 0, en: 1, ru: 2 }[lang]]; }
  function wKind(code) {
    if ([71, 73, 75, 77, 85, 86].indexOf(code) > -1) return "snow";
    if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].indexOf(code) > -1) return "rain";
    if (code === 45 || code === 48) return "fog";
    return "dry";
  }
  function fmtTime(iso) { return iso ? iso.slice(11, 16) : "–"; }
  function fetchWeather() {
    var url = "https://api.open-meteo.com/v1/forecast?latitude=" + ZAB.lat + "&longitude=" + ZAB.lon +
      "&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,snow_depth,cloud_cover,is_day" +
      "&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset&timezone=Europe%2FPodgorica&forecast_days=3";
    fetch(url).then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (j) {
      weather = j;
      var c = j.current || {};
      document.documentElement.setAttribute("data-fog", wKind(c.weather_code) === "fog" ? "1" : "0");
      document.documentElement.setAttribute("data-cloud", (c.cloud_cover > 80 || [3, 45, 48].indexOf(c.weather_code) > -1) ? "1" : "0");
      renderWeather(); setPhase(); declutter();
    }).catch(function () { weather = false; renderWeather(); });
  }
  function renderWeather() {
    var strip = $("#nowstrip"), card = $("#wx");
    if (weather === null) { strip.innerHTML = '<span class="dot"></span><span class="muted">' + esc(t("now.loading")) + "</span>"; card.innerHTML = '<p class="muted">' + esc(t("now.loading")) + "</p>"; return; }
    if (!weather) { strip.innerHTML = '<span class="muted">' + esc(t("now.fail")) + "</span>"; card.innerHTML = '<p class="muted">' + esc(t("now.fail")) + "</p>"; return; }
    var c = weather.current, dl = weather.daily, snow = c.snow_depth != null ? Math.round(c.snow_depth * 100) : null;
    strip.innerHTML = '<span class="dot"></span><span>' + esc(t("now.live")) + '</span><span class="t">' + Math.round(c.temperature_2m) + '°</span><span>' + esc(wLabel(c.weather_code)) +
      '</span><span class="muted">' + esc(t("now.wind")) + " " + Math.round(c.wind_speed_10m) + " " + t("u.kmh") + "</span>" +
      (snow ? '<span class="muted">' + esc(t("now.snow")) + " " + snow + " " + t("u.cm") + "</span>" : "") +
      '<span class="muted">☀ ' + fmtTime(dl.sunrise[0]) + " – " + fmtTime(dl.sunset[0]) + "</span>";
    var days = "";
    for (var i = 0; i < 3; i++) {
      var dn = i === 0 ? t("now.today") : i === 1 ? t("now.tomorrow") : new Date(dl.time[i] + "T12:00:00").toLocaleDateString(lang === "me" ? "sr-Latn-ME" : lang, { weekday: "long" });
      days += "<div>" + esc(dn) + "<b>" + Math.round(dl.temperature_2m_min[i]) + "° / " + Math.round(dl.temperature_2m_max[i]) + "°</b>" + esc(wLabel(dl.weather_code[i])) + "</div>";
    }
    card.innerHTML = '<div class="wx-top"><div class="wx-temp">' + Math.round(c.temperature_2m) + '°</div><div><div class="wx-cond">' + esc(wLabel(c.weather_code)) +
      '</div><div class="wx-place">' + esc(t("now.place")) + "</div></div></div>" +
      '<div class="wx-facts"><div>' + esc(t("now.feels")) + "<b>" + Math.round(c.apparent_temperature) + "°</b></div><div>" + esc(t("now.wind")) + "<b>" + Math.round(c.wind_speed_10m) + " " + t("u.kmh") + "</b></div>" +
      "<div>" + esc(t("now.snow")) + "<b>" + (snow == null ? "–" : snow + " " + t("u.cm")) + "</b></div><div>" + esc(t("now.clouds")) + "<b>" + Math.round(c.cloud_cover) + "%</b></div>" +
      "<div>" + esc(t("now.sunrise")) + "<b>" + fmtTime(dl.sunrise[0]) + "</b></div><div>" + esc(t("now.sunset")) + "<b>" + fmtTime(dl.sunset[0]) + "</b></div></div>" +
      '<div class="wx-days">' + days + "</div>";
  }

  /* ---------- particles (snow, rain, leaves, stars, fireflies) ---------- */
  var particles = (function () {
    var cv = $("#particles"), ctx = cv.getContext("2d"), W = 0, H = 0, dpr = 1, mode = [], parts = [], stars = [], raf = 0, last = 0;
    function size() { dpr = Math.min(1.5, window.devicePixelRatio || 1); W = cv.clientWidth; H = cv.clientHeight; cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
    function pickMode() {
      var ph = document.documentElement.getAttribute("data-phase"), m = [], live = season === curSeason && weather && weather.current;
      var kind = live ? wKind(weather.current.weather_code) : null;
      var cloudy = live ? weather.current.cloud_cover > 70 : false;
      if (ph === "night" && !cloudy && kind !== "snow" && kind !== "rain") m.push("stars");
      if (kind === "snow") m.push("snow"); else if (kind === "rain") m.push("rain");
      else if (!live || kind === "dry" || kind === "fog") {
        if (season === "winter") m.push(live ? "" : "snow");
        if (season === "autumn") m.push("leaves");
        if (season === "summer" && ph === "night") m.push("flies");
      }
      if (P.birds && ph !== "night" && kind !== "rain" && kind !== "snow") m.push("birds");
      return m.filter(Boolean);
    }
    function spawn(kind) {
      var small = W < 700;
      var n = { snow: small ? 70 : 140, rain: small ? 80 : 160, leaves: small ? 10 : 18, flies: small ? 16 : 30, birds: small ? 3 : 5 }[kind] || 0, out = [];
      for (var i = 0; i < n; i++) out.push(make(kind, true));
      return out;
    }
    function make(kind, init) {
      var p = { k: kind, x: Math.random() * W, y: init ? Math.random() * H : -20, s: Math.random() };
      if (kind === "snow") { p.r = 0.8 + p.s * 2.4; p.vy = 18 + p.s * 40; p.vx = -8 + Math.random() * 16; p.ph = Math.random() * 6; }
      if (kind === "rain") { p.l = 10 + p.s * 14; p.vy = 520 + p.s * 300; p.vx = -60; }
      if (kind === "leaves") { p.r = 4 + p.s * 5; p.vy = 22 + p.s * 30; p.vx = 10 + Math.random() * 30; p.rot = Math.random() * 6; p.vr = -1.5 + Math.random() * 3; p.c = ["#c8892f", "#a8572b", "#d9b04a", "#8b3f22"][i4()]; }
      if (kind === "flies") { p.y = H * (0.45 + Math.random() * 0.5); p.ph = Math.random() * 6; p.vx = -10 + Math.random() * 20; p.vy = -6 + Math.random() * 12; }
      if (kind === "birds") { p.x = init ? Math.random() * W : -60; p.y = H * (0.1 + Math.random() * 0.28); p.r = 7 + p.s * 9; p.vx = 14 + p.s * 18; p.ph = Math.random() * 6; p.f = 0.6 + Math.random() * 0.5; }
      return p;
    }
    function i4() { return Math.floor(Math.random() * 4); }
    function retune() {
      if (!cv) return;
      mode = pickMode(); parts = [];
      mode.forEach(function (k) { if (k !== "stars") parts = parts.concat(spawn(k)); });
      stars = [];
      if (mode.indexOf("stars") > -1) for (var i = 0; i < (W < 700 ? 90 : 180); i++) stars.push({ x: Math.random() * W, y: Math.random() * H * 0.55, r: Math.random() * 1.3 + 0.2, ph: Math.random() * 6 });
      if (reduced) draw(0); else if (!raf) { last = performance.now(); raf = requestAnimationFrame(loop); }
    }
    function draw(dt) {
      ctx.clearRect(0, 0, W, H);
      var tm = performance.now() / 1000;
      for (var i = 0; i < stars.length; i++) { var s = stars[i]; ctx.globalAlpha = 0.45 + 0.4 * Math.sin(tm * 1.3 + s.ph); ctx.fillStyle = "#f3f6ff"; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.283); ctx.fill(); }
      ctx.globalAlpha = 1;
      for (var j = 0; j < parts.length; j++) {
        var p = parts[j];
        if (p.k === "snow") { p.y += p.vy * dt; p.x += (p.vx + Math.sin(tm + p.ph) * 12) * dt; ctx.globalAlpha = 0.55 + p.s * 0.4; ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill(); }
        else if (p.k === "rain") { p.y += p.vy * dt; p.x += p.vx * dt; ctx.globalAlpha = 0.25 + p.s * 0.25; ctx.strokeStyle = "#cfe0ea"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + p.vx * 0.02, p.y + p.l); ctx.stroke(); }
        else if (p.k === "leaves") { p.y += p.vy * dt; p.x += (p.vx + Math.sin(tm * 1.7 + p.s * 9) * 25) * dt; p.rot += p.vr * dt; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(1, 0.55 + 0.45 * Math.sin(tm * 3 + p.s * 7)); ctx.globalAlpha = 0.85; ctx.fillStyle = p.c; ctx.beginPath(); ctx.ellipse(0, 0, p.r, p.r * 0.55, 0, 0, 6.283); ctx.fill(); ctx.restore(); }
        else if (p.k === "flies") { p.x += (p.vx + Math.sin(tm + p.ph) * 8) * dt; p.y += (p.vy + Math.cos(tm * 0.8 + p.ph) * 6) * dt; var a = 0.3 + 0.7 * Math.max(0, Math.sin(tm * 2 + p.ph)); ctx.globalAlpha = a; ctx.fillStyle = "#e8f59a"; ctx.shadowColor = "#e8f59a"; ctx.shadowBlur = 8; ctx.beginPath(); ctx.arc(p.x, p.y, 1.6, 0, 6.283); ctx.fill(); ctx.shadowBlur = 0; if (p.x < -10 || p.x > W + 10 || p.y < H * 0.3 || p.y > H + 10) { parts[j] = make("flies", true); } continue; }
        else if (p.k === "birds") {
          p.x += p.vx * dt; p.y += Math.sin(tm * 0.4 + p.ph) * 4 * dt;
          var fl = Math.sin(tm * p.f * 3.2 + p.ph) * 0.45, r = p.r;
          ctx.globalAlpha = 0.7; ctx.strokeStyle = "rgba(30, 40, 46, .75)"; ctx.lineWidth = 1.6; ctx.lineCap = "round";
          ctx.beginPath(); ctx.moveTo(p.x - r, p.y - r * fl); ctx.quadraticCurveTo(p.x - r * 0.4, p.y - r * 0.35 - r * fl * 0.4, p.x, p.y);
          ctx.quadraticCurveTo(p.x + r * 0.4, p.y - r * 0.35 - r * fl * 0.4, p.x + r, p.y - r * fl); ctx.stroke();
          if (p.x > W + 60) parts[j] = make("birds", false);
          continue;
        }
        if (p.y > H + 20 || p.x < -40 || p.x > W + 40) { parts[j] = make(p.k, false); parts[j].x = Math.random() * W; }
      }
      ctx.globalAlpha = 1;
    }
    function loop(ts) {
      var dt = Math.min(0.05, (ts - last) / 1000); last = ts;
      if (!document.hidden) draw(dt);
      raf = (mode.length && !reduced) ? requestAnimationFrame(loop) : 0;
      if (!mode.length) ctx.clearRect(0, 0, W, H);
    }
    if (cv) { size(); window.addEventListener("resize", function () { size(); retune(); }); }
    return { retune: retune };
  })();

  /* ---------- peak labels: hide any that would sit on the hero text or on each other ---------- */
  function declutter() {
    // the area actually covered by hero text and buttons (a block h1 spans the full width, its text does not)
    var obs = [].map.call(document.querySelectorAll(".hero > *"), function (el) { var rg = document.createRange(); rg.selectNodeContents(el); return rg.getBoundingClientRect(); }).filter(function (r) { return r.width; });
    var labels = [].slice.call(document.querySelectorAll(".peak-label")).sort(function (a, b) { return a.classList.contains("minor") - b.classList.contains("minor"); }), kept = [];
    function hit(r, q, pad) { return r.left < q.right + pad && r.right > q.left - pad && r.top < q.bottom + pad && r.bottom > q.top - pad; }
    labels.forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (!r.width) return;
      var bad = obs.some(function (q) { return hit(r, q, 8); }) || kept.some(function (q) { return hit(r, q, 4); });
      el.style.visibility = bad ? "hidden" : "";
      if (!bad) kept.push(r);
    });
  }

  /* ---------- parallax ---------- */
  function parallax() {
    var layers = $$("[data-speed]"), ticking = false;
    window.addEventListener("resize", declutter);
    var pc = $("#particles");
    function apply() {
      ticking = false;
      var y = Math.min(window.scrollY || 0, window.innerHeight * 3);
      placeSky();
      // weather particles belong to the hero; keep only a trace over the content
      if (pc) pc.style.opacity = Math.max(0.15, 1 - y / (window.innerHeight * 0.8)).toFixed(2);
      for (var i = 0; i < layers.length; i++) {
        var k = +layers[i].getAttribute("data-speed");
        layers[i].style.transform = "translate3d(-50%," + (-y * k).toFixed(1) + "px,0)";
      }
      declutter();
    }
    if (reduced) { declutter(); return; }
    window.addEventListener("scroll", function () { if (!ticking) { ticking = true; requestAnimationFrame(apply); } }, { passive: true });
    apply();
  }

  /* ---------- icons ---------- */
  var ICON = {
    shoe: '<path d="M4 15c0-3 1-7 2-9h4l1 3 3 1c3 1 6 2 6 5v1H4z"/><path d="M4 18h16"/>',
    boot: '<path d="M7 3h5v7l4 2c2 1 4 2 4 4v2H5V9z"/><path d="M5 18h15M9 6h3M9 9h3"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    jacket: '<path d="M9 3l3 3 3-3 4 2 2 6-3 1v9H6v-9l-3-1 2-6z"/><path d="M12 6v15"/>',
    rain: '<path d="M4 12a8 8 0 0116 0z"/><path d="M12 12v7a2 2 0 01-4 0"/>',
    layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
    water: '<path d="M9 2h6v3l2 3v13H7V8l2-3z"/><path d="M7 12h10"/>',
    map: '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>',
    lamp: '<rect x="8" y="9" width="8" height="6" rx="2"/><path d="M3 12h5M16 12h5M12 4v3M5 6l2 2M19 6l-2 2"/>',
    gloves: '<path d="M7 21v-5l-3-5 2-1 3 3V5a1 1 0 012 0v5-6a1 1 0 012 0v6-5a1 1 0 012 0v6l1-3a1 1 0 012 1l-2 7v5z"/>',
    thermos: '<rect x="8" y="5" width="8" height="16" rx="2"/><path d="M9 2h6v3H9zM8 10h8"/>',
    spikes: '<path d="M4 14h16v3H4z"/><path d="M5 17l1 3M9 17l1 3M14 17l1 3M18 17l1 3M8 14V9l4-3 4 3v5"/>',
    poles: '<path d="M7 2l3 20M17 2l-3 20M6 4h3M15 4h3"/>',
    warn: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/>',
    cabin: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M5 13h14M5 16h14M10 20v-4h4v4"/>',
    flat: '<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2"/>',
    card: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/>',
    pin: '<path d="M12 22s7-7 7-12a7 7 0 00-14 0c0 5 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/>',
    leaf: '<path d="M5 19c0-9 5-14 15-15-1 10-6 15-15 15z"/><path d="M5 19l8-8"/>',
    nav: '<path d="M3 11l18-8-8 18-2-8z"/>',
    dl: '<path d="M12 3v12M7 10l5 5 5-5M4 20h16"/>',
    print: '<path d="M6 9V3h12v6M6 18H4v-7h16v7h-2M7 14h10v7H7z"/>',
    boat: '<path d="M3 15h18l-3 5H6z"/><path d="M12 3v12M12 4l6 8h-6"/>',
    hat: '<path d="M3 16c3 2 15 2 18 0"/><path d="M6 16c0-5 2-9 6-9s6 4 6 9"/>',
    bino: '<circle cx="7" cy="15" r="4"/><circle cx="17" cy="15" r="4"/><path d="M5 11l2-6h3l1 6M19 11l-2-6h-3l-1 6M11 13h2"/>',
    bug: '<ellipse cx="12" cy="14" rx="4" ry="6"/><path d="M12 8V5M8 11L4 9M16 11l4-2M8 15H3M16 15h5M8 19l-3 2M16 19l3 2"/>',
    swim: '<path d="M2 18c2 1.5 4 1.5 6 0s4-1.5 6 0 4 1.5 6 0M2 14c2 1.5 4 1.5 6 0s4-1.5 6 0 4 1.5 6 0"/><circle cx="15" cy="6" r="2"/><path d="M6 12l4-5 4 3"/>'
  };
  function icon(n) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICON[n] || ICON.leaf) + "</svg>"; }
  var KNAFELC = '<svg class="marker" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="9" fill="#cc3a30"/><circle cx="10" cy="10" r="4.2" fill="#fff"/></svg>';

  /* ---------- helpers ---------- */
  function photo(id) { return id && D.photos && D.photos[id] ? D.photos[id] : null; }
  function bg(id) { var p = photo(id); return p ? "background-image:url('" + p.src + "')" : ""; }
  function hike(id) { for (var i = 0; i < D.hikes.length; i++) if (D.hikes[i].id === id) return D.hikes[i]; }
  function drive(id) { for (var i = 0; i < D.drives.length; i++) if (D.drives[i].id === id) return D.drives[i]; }
  function diffHtml(d) { var b = ""; for (var i = 1; i <= 4; i++) b += '<b class="' + (i <= d ? "on" : "") + '"></b>'; return '<span class="diff d' + d + '"><i>' + b + "</i>" + esc(t("d" + d)) + "</span>"; }
  function monthsHtml(m) {
    var cur = PM, s = '<div class="months" aria-hidden="true">';
    for (var i = 0; i < 12; i++) s += '<span class="m' + m[i] + (i === cur ? " now" : "") + '"></span>';
    s += '</div><div class="months-l" aria-hidden="true">';
    for (var j = 0; j < 12; j++) s += "<span>" + esc(t("months")[j]) + "</span>";
    return s + "</div>";
  }
  function fmtNum(n) { return lang === "en" ? String(n) : String(n).replace(".", ","); }
  function hoursTxt(h) { return fmtNum(h) + " " + t("u.h"); }
  function gmapsDir(o) {
    var u = "https://www.google.com/maps/dir/?api=1&travelmode=driving";
    if (o.origin) u += "&origin=" + encodeURIComponent(o.origin);
    u += "&destination=" + encodeURIComponent(o.destination);
    if (o.waypoints && o.waypoints.length) u += "&waypoints=" + o.waypoints.map(encodeURIComponent).join("%7C");
    return u;
  }
  function gmapsPt(p) { return "https://www.google.com/maps/search/?api=1&query=" + p[0] + "," + p[1]; }
  function copyText(txt, btn) {
    var done = function () { var o = btn.textContent; btn.textContent = t("r.copied"); setTimeout(function () { btn.textContent = o; }, 1400); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, function () { selectFallback(txt); done(); });
    else { selectFallback(txt); done(); }
  }
  function selectFallback(txt) { var ta = document.createElement("textarea"); ta.value = txt; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch (e) {} ta.remove(); }

  /* ---------- static i18n ---------- */
  function applyStatic() {
    document.documentElement.lang = lang === "me" ? "sr-Latn-ME" : lang;
    document.title = t("meta.title");
    $$("[data-i18n]").forEach(function (el) { el.textContent = t(el.getAttribute("data-i18n")); });
    $$(".langs button").forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-lang") === lang ? "true" : "false"); });
    var ls = $("[data-lang-sel]"); if (ls) ls.value = lang;
    var mb = $("#mode-name"); if (mb) mb.textContent = t("mode." + mode);
    var mt = $("[data-mode-cycle]"); if (mt) mt.title = t("mode.title");
  }

  /* ---------- season UI ---------- */
  function setSeason(s) {
    season = s;
    document.documentElement.setAttribute("data-season", s);
    $("#hero-tag").textContent = L(S.tagline[s]);
    $("#season-pill-name").textContent = t("season." + s);
    renderSeasonTabs(); renderPicks(); renderGear(); particles.retune();
  }
  function renderSeasonTabs() {
    $("#season-tabs").innerHTML = S.order.map(function (s) {
      return '<button type="button" data-season="' + s + '" aria-pressed="' + (s === season) + '">' + esc(t("season." + s)) + (s === curSeason ? '<span class="cur">' + esc(t("season.now")) + "</span>" : "") + "</button>";
    }).join("");
    var m = PM;
    $("#month-note").innerHTML = '<span class="m">' + esc(t("monthsLong")[m]) + "</span>" + esc(L(S.month[m]));
  }
  /* "what to look out for now": facts for the current month in the park, each with its source */
  function renderNature() {
    var N = window.MT_NATURE, box = $("#nature");
    if (!N || !box || !N.parks[PARK]) return;
    var all = N.parks[PARK], mo = PM + 1;
    var list = all.filter(function (f) { return f.m && f.m.indexOf(mo) >= 0; });
    all.forEach(function (f) { if (!f.m && list.length < 2) list.push(f); });
    list = list.slice(0, 3);
    if (!list.length) { box.hidden = true; return; }
    $("#nature-m").textContent = t("monthsLong")[PM];
    $("#nature-list").innerHTML = list.map(function (f) {
      var src = f.src.map(function (k) { var o = N.src[k]; return '<a href="' + esc(o.u) + '" target="_blank" rel="noopener">' + esc(o.n) + "</a>"; }).join(", ");
      return '<div class="nfact panel"><span class="ntag">' + esc(L(N.tags[f.tag])) + "</span><p>" + esc(L(f.t)) + '</p><span class="nsrc">' + esc(t(f.src.length > 1 ? "nature.srcs" : "nature.src")) + ": " + src + "</span></div>";
    }).join("");
    box.hidden = false;
  }
  function renderPicks() {
    $("#picks").innerHTML = S.picks[season].map(function (p) {
      var name, ph, kind = t("kind." + p.type), target;
      if (p.type === "hike") { var h = hike(p.id); name = L(h.name); ph = bg(p.id); target = "#t-" + p.id; }
      else if (p.type === "drive") { var d = drive(p.id); name = L(d.name); ph = bg("drive-" + p.id); target = "#roads"; }
      else { name = L(p.name); ph = bg(p.photo); target = p.href; }
      return '<a class="pick panel" href="' + target + '" data-drive="' + (p.type === "drive" ? p.id : "") + '"><div class="ph" style="' + ph + '"><span class="k">' + esc(kind) + '</span></div><div class="tx"><b>' + esc(name) + "</b><span>" + esc(L(p.why)) + "</span></div></a>";
    }).join("");
  }

  /* ---------- trails ---------- */
  var filter = "all";
  function passes(h) {
    if (filter === "easy") return h.diff <= 1;
    if (filter === "mid") return h.diff === 2 || h.diff === 3;
    if (filter === "hard") return h.diff >= 4;
    if (filter === "now") return h.months[PM] === 2;
    if (filter === "kids") return h.kids;
    return true;
  }
  function renderFilters() {
    $("#filters").innerHTML = ["all", "now", "easy", "mid", "hard", "kids"].map(function (f) {
      return '<button type="button" class="chip" data-f="' + f + '" aria-pressed="' + (f === filter) + '">' + esc(t("f." + f)) + "</button>";
    }).join("");
  }
  function renderTrails() {
    var m = PM;
    var list = D.hikes.filter(passes);
    $("#trail-list").innerHTML = list.map(function (h) {
      var p = photo(h.id), state = h.months[m] === 2 ? '<span class="badge-now">' + esc(t("r.goodnow")) + "</span>" : h.months[m] === 0 ? '<span class="badge-off">' + esc(t("r.notnow")) + "</span>" : "";
      return '<a class="card panel" href="#t-' + h.id + '"><div class="ph' + (p ? "" : " none") + '" style="' + bg(h.id) + '"></div><div class="body">' +
        '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' + diffHtml(h.diff) + state + "</div>" +
        '<div class="name">' + esc(L(h.name)) + '</div><div class="tag">' + esc(L(h.tag)) + "</div>" +
        '<div class="stats"><span>' + fmtNum(h.km) + " " + t("u.km") + " <small>" + esc(t(h.kind === "loop" ? "u.loop" : "u.out")) + "</small></span><span>↑ " + h.gain + " " + t("u.m") + "</span><span>" + hoursTxt(h.hours) + "</span><span>▲ " + h.top + " " + t("u.m") + "</span></div>" +
        monthsHtml(h.months) + "</div></a>";
    }).join("");
    if (overview) drawOverview();
  }
  var overview = null, ovLayer = null;
  var TILE = "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png";
  var ATTR = 'Map data © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, SRTM · style © <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)';
  var DCOL = { 1: "#8fd3a9", 2: "#c5d67c", 3: "#f0b765", 4: "#f08a72" };
  function makeMap(el, opts) {
    var m = L_.map(el, Object.assign({ scrollWheelZoom: false, zoomControl: true, attributionControl: true }, opts || {}));
    L_.tileLayer(TILE, { subdomains: "abc", maxZoom: 17, attribution: ATTR }).addTo(m);
    return m;
  }
  var L_ = window.L;
  function drawOverview() {
    if (!L_) return;
    if (ovLayer) ovLayer.remove();
    ovLayer = L_.layerGroup().addTo(overview);
    var b = [];
    D.hikes.filter(passes).forEach(function (h) {
      L_.polyline(h.line, { color: "#0b1d15", weight: 7, opacity: 0.7 }).addTo(ovLayer);
      var pl = L_.polyline(h.line, { color: DCOL[h.diff], weight: 4 }).addTo(ovLayer);
      var mk = L_.marker(h.start, { icon: L_.divIcon({ className: "", html: '<div class="start-marker"></div>', iconSize: [14, 14] }) }).addTo(ovLayer);
      var pop = "<b>" + esc(L(h.name)) + "</b><br>" + fmtNum(h.km) + " " + t("u.km") + " · " + hoursTxt(h.hours) + '<br><a href="#t-' + h.id + '">' + esc(t("r.map")) + "</a>";
      pl.bindPopup(pop); mk.bindPopup(pop);
      b = b.concat(h.line);
    });
    if (b.length) overview.fitBounds(b, { padding: [24, 24] });
  }
  function initOverview() {
    if (overview || !L_) return;
    overview = makeMap("ovmap");
    drawOverview();
  }

  /* ---------- route sheet ---------- */
  var sheetMap = null;
  function profileSvg(h) {
    var p = h.profile, W = 640, H = 170, pad = 30, min = Math.min.apply(null, p), max = Math.max.apply(null, p);
    var lo = Math.floor((min - 40) / 100) * 100, hi = Math.ceil((max + 40) / 100) * 100;
    var x = function (i) { return pad + i * (W - pad - 8) / (p.length - 1); }, y = function (v) { return 10 + (H - 34) * (1 - (v - lo) / (hi - lo)); };
    var line = p.map(function (v, i) { return (i ? "L" : "M") + x(i).toFixed(1) + "," + y(v).toFixed(1); }).join("");
    var area = line + "L" + x(p.length - 1).toFixed(1) + "," + (H - 24) + "L" + pad + "," + (H - 24) + "Z";
    var grid = "";
    for (var v = lo; v <= hi; v += (hi - lo > 600 ? 200 : 100)) grid += '<line x1="' + pad + '" x2="' + (W - 8) + '" y1="' + y(v).toFixed(1) + '" y2="' + y(v).toFixed(1) + '" stroke="rgba(232,239,234,.1)"/><text x="' + (pad - 4) + '" y="' + (y(v) + 3).toFixed(1) + '" text-anchor="end">' + v + "</text>";
    var km = h.kind === "loop" ? h.km : h.oneWayKm, ticks = "";
    for (var k = 0; k <= Math.floor(km); k += (km > 6 ? 2 : 1)) ticks += '<text x="' + (pad + k / km * (W - pad - 8)).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle">' + k + "</text>";
    var mi = p.indexOf(max);
    return '<svg class="profile" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(t("r.profile")) + '">' +
      '<defs><linearGradient id="pg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#74c99c" stop-opacity=".55"/><stop offset="1" stop-color="#74c99c" stop-opacity="0"/></linearGradient></defs>' +
      grid + '<path d="' + area + '" fill="url(#pg)"/><path d="' + line + '" fill="none" stroke="#74c99c" stroke-width="2"/>' +
      '<circle cx="' + x(mi).toFixed(1) + '" cy="' + y(max).toFixed(1) + '" r="4" fill="#e2ad62"/><text x="' + Math.min(W - 40, x(mi)).toFixed(1) + '" y="' + (y(max) - 8).toFixed(1) + '" text-anchor="middle" style="fill:#f1c886">' + h.top + " m</text>" +
      ticks + '<text x="' + (W - 8) + '" y="' + (H - 8) + '" text-anchor="end">' + t("u.km") + (h.kind === "loop" ? "" : " · " + esc(t("u.oneway"))) + "</text></svg>";
  }
  function traceSvg(h) {
    var ln = h.line, la = ln.map(function (p) { return p[0]; }), lo = ln.map(function (p) { return p[1]; });
    var a0 = Math.min.apply(null, la), a1 = Math.max.apply(null, la), o0 = Math.min.apply(null, lo), o1 = Math.max.apply(null, lo);
    var k = Math.cos(a0 * Math.PI / 180), w = (o1 - o0) * k, hh = a1 - a0, s = 300 / Math.max(w, hh);
    var W = w * s + 20, H = hh * s + 20;
    var d = ln.map(function (p, i) { return (i ? "L" : "M") + ((p[1] - o0) * k * s + 10).toFixed(1) + "," + ((a1 - p[0]) * s + 10).toFixed(1); }).join("");
    return '<svg class="trace" viewBox="0 0 ' + W.toFixed(0) + " " + H.toFixed(0) + '" aria-hidden="true"><path d="' + d + '" fill="none" stroke="#e2ad62" stroke-width="2.2" stroke-linejoin="round"/></svg>';
  }
  function wearFor(h) {
    var lvl = h.diff >= 3 ? "hard" : "easy", list = S.gear[season][lvl];
    return list.map(function (g) { return "<li>" + icon(g[0]) + "<span><b>" + esc(L(g[1])) + "</b>" + (g[2] ? " " + esc(L(g[2])) : "") + "</span></li>"; }).join("");
  }
  function openSheet(id) {
    var h = hike(id); if (!h) return;
    var p = photo(h.id), m = PM;
    var coords = h.start[0].toFixed(5) + ", " + h.start[1].toFixed(5);
    $("#sheet-pane").innerHTML =
      '<button class="close" type="button" aria-label="Close" data-close>×</button>' +
      '<div class="cover' + (p ? "" : " none") + '" style="' + bg(h.id) + '">' + (p ? '<span class="credit">' + esc(p.author) + " · " + esc(p.license) + "</span>" : "") + "</div>" +
      '<div class="inner">' +
      '<div style="display:grid;gap:10px"><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">' + KNAFELC + diffHtml(h.diff) +
      (h.months[m] === 2 ? '<span class="badge-now">' + esc(t("r.goodnow")) + "</span>" : h.months[m] === 0 ? '<span class="badge-off">' + esc(t("r.notnow")) + "</span>" : "") +
      '</div><h2 id="sheet-title">' + esc(L(h.name)) + '</h2><p class="lede" style="margin:0">' + esc(L(h.tag)) + "</p></div>" +
      '<div class="bigstats"><div><b>' + fmtNum(h.km) + " " + t("u.km") + "</b><small>" + esc(t(h.kind === "loop" ? "u.loop" : "u.out")) + "</small></div><div><b>" + hoursTxt(h.hours) + "</b><small>" + esc(t("u.time")) + "</small></div><div><b>↑ " + h.gain + " " + t("u.m") + "</b><small>" + esc(t("u.up")) + "</small></div><div><b>" + h.top + " " + t("u.m") + "</b><small>" + esc(t("u.top")) + "</small></div></div>" +
      '<div class="actions"><a class="btn primary small" target="_blank" rel="noopener" href="' + gmapsDir({ destination: h.start[0] + "," + h.start[1] }) + '">' + icon("nav") + esc(t("r.nav")) + '</a><a class="btn ghost small" href="' + h.gpx + '" download>' + icon("dl") + esc(t("r.gpx")) + '</a><button class="btn ghost small" type="button" data-print>' + icon("print") + esc(t("r.print")) + "</button></div>" +
      '<div><h4>' + esc(t("r.start")) + '</h4><div class="coords"><span>' + esc(L(h.startName)) + '</span></div><div class="coords" style="margin-top:6px"><span>' + coords + '</span><button class="copy" type="button" data-copy="' + coords + '">' + esc(t("r.copy")) + "</button></div></div>" +
      '<div><h4>' + esc(t("r.map")) + '</h4><div class="smap" id="smap"></div></div>' +
      '<div><h4>' + esc(t("r.profile")) + "</h4>" + profileSvg(h) + "</div>" +
      '<div><h4>' + esc(t("r.months")) + "</h4>" + monthsHtml(h.months) + "</div>" +
      '<div><h4>' + esc(t("r.wear")) + ' · ' + esc(t("season." + season)) + '</h4><ul class="ticks">' + wearFor(h) + "</ul></div>" +
      '<div><h4>' + esc(t("r.know")) + '</h4><ul class="notes">' + h.notes.map(function (n) { return "<li>" + esc(L(n)) + "</li>"; }).join("") + "</ul></div>" +
      '<div class="print-only">' + traceSvg(h) + "</div>" +
      '<p class="src">' + esc(t("r.disclaimer")) + "</p></div>";
    $("#sheet").hidden = false; document.body.style.overflow = "hidden";
    $("#sheet-pane").scrollTop = 0;
    setTimeout(function () {
      if (!L_) return;
      if (sheetMap) { sheetMap.remove(); sheetMap = null; }
      sheetMap = makeMap("smap");
      L_.polyline(h.line, { color: "#0b1d15", weight: 7, opacity: 0.7 }).addTo(sheetMap);
      var pl = L_.polyline(h.line, { color: DCOL[h.diff], weight: 4 }).addTo(sheetMap);
      L_.marker(h.start, { icon: L_.divIcon({ className: "", html: '<div class="start-marker"></div>', iconSize: [14, 14] }) }).addTo(sheetMap);
      sheetMap.fitBounds(pl.getBounds(), { padding: [20, 20] });
    }, 60);
    $(".close", $("#sheet-pane")).focus();
  }
  function closeSheet() {
    $("#sheet").hidden = true; document.body.style.overflow = "";
    if (sheetMap) { sheetMap.remove(); sheetMap = null; }
    if (/^#t-/.test(location.hash)) history.replaceState(null, "", location.pathname + location.search + "#trails");
  }
  function route() {
    var h = location.hash;
    if (/^#t-/.test(h)) openSheet(h.slice(3)); else if (!$("#sheet").hidden) closeSheet();
  }

  /* ---------- drives ---------- */
  var curDrive = D.drives[0].id, dmap = null, dLayer = null;
  function renderDrives() {
    $("#drive-tabs").innerHTML = D.drives.map(function (d) { return '<button type="button" class="chip" data-d="' + d.id + '" aria-pressed="' + (d.id === curDrive) + '">' + esc(L(d.name)) + "</button>"; }).join("");
    var d = drive(curDrive), m = PM;
    var stat = [];
    if (d.km) stat.push("<span>" + d.km + " " + t("roads.km") + (d.oneway ? " <small>" + esc(t("u.oneway")) + "</small>" : "") + "</span>");
    if (d.hours) stat.push("<span>" + esc(L(d.hours)) + "</span>");
    var btns = d.gmaps ? '<a class="btn primary" target="_blank" rel="noopener" href="' + gmapsDir(d.gmaps) + '">' + icon("nav") + esc(t("roads.open")) + "</a>" :
      '<div class="variants">' + (d.variants || []).map(function (v) { return '<a class="btn ghost" target="_blank" rel="noopener" href="' + gmapsDir(v) + '">' + icon("nav") + esc(L(v.n)) + "</a>"; }).join("") + "</div>";
    $("#drive").innerHTML = '<div class="info"><div style="display:grid;gap:8px"><h3>' + esc(L(d.name)) + '</h3><p class="lede" style="margin:0;font-size:16px">' + esc(L(d.tag)) + "</p>" +
      (stat.length ? '<div class="stats">' + stat.join("") + "</div>" : "") + (d.id !== "arrive" ? '<div><h4 style="margin:6px 0">' + esc(t("roads.season")) + "</h4>" + monthsHtml(d.season) + "</div>" : "") + "</div>" + btns +
      (d.stops.length ? '<ol class="stops">' + d.stops.map(function (s) { return "<li><span><b>" + esc(L(s.n)) + "</b><small>" + esc(L(s.d)) + '</small></span><a target="_blank" rel="noopener" href="' + gmapsPt(s.p) + '">' + esc(t("roads.pt")) + "</a></li>"; }).join("") + "</ol>" : "") +
      '<ul class="notes">' + d.notes.map(function (n) { return "<li>" + esc(L(n)) + "</li>"; }).join("") + "</ul>" +
      (d.src ? '<p class="src">' + esc(t("roads.src")) + ' <a href="' + d.src.u + '" target="_blank" rel="noopener">' + esc(d.src.t) + "</a></p>" : "") + "</div>" +
      '<div class="dmap"><div class="map" id="dmap"></div></div>';
    if (L_) {
      if (dmap) { dmap.remove(); dmap = null; }
      if (driveSeen) drawDrive();
    }
  }
  var driveSeen = false;
  function drawDrive() {
    var d = drive(curDrive);
    dmap = makeMap("dmap");
    var b = [];
    if (d.line) { L_.polyline(d.line, { color: "#0b1d15", weight: 7, opacity: .7 }).addTo(dmap); L_.polyline(d.line, { color: "#e2ad62", weight: 4 }).addTo(dmap); b = b.concat(d.line); }
    d.stops.forEach(function (s, i) {
      L_.marker(s.p, { icon: L_.divIcon({ className: "", html: '<div class="num-marker">' + (i + 1) + "</div>", iconSize: [24, 24] }) }).bindPopup("<b>" + esc(L(s.n)) + "</b><br>" + esc(L(s.d))).addTo(dmap);
      b.push(s.p);
    });
    if (!b.length) b = [D.center, D.center];
    dmap.fitBounds(b, { padding: [28, 28] });
  }

  /* ---------- gear ---------- */
  var gearLvl = "easy";
  function renderGear() {
    $("#gear-season").innerHTML = S.order.map(function (s) { return '<button type="button" data-gs="' + s + '" aria-pressed="' + (s === season) + '">' + esc(t("season." + s)) + "</button>"; }).join("");
    $("#gear-level").innerHTML = ["easy", "hard"].map(function (l) { return '<button type="button" data-gl="' + l + '" aria-pressed="' + (l === gearLvl) + '">' + esc(t("gear." + l)) + "</button>"; }).join("");
    $("#kit").innerHTML = S.gear[season][gearLvl].map(function (g) { return "<li>" + icon(g[0]) + "<span><b>" + esc(L(g[1])) + "</b>" + (g[2] ? "<small>" + esc(L(g[2])) + "</small>" : "") + "</span></li>"; }).join("");
    var d = new Date(), md = (d.getMonth() + 1) * 100 + d.getDate(), on = md >= 1115 || md <= 331;
    $("#tyre-status").className = "tyre-status" + (on ? " on" : "");
    $("#tyre-status").innerHTML = '<span class="lamp"></span>' + esc(t(on ? "tyre.on" : "tyre.off"));
    $("#tyres").innerHTML = S.tyres.map(function (x) { return "<li>" + esc(L(x)) + "</li>"; }).join("");
  }

  /* ---------- stay, business, know ---------- */
  function renderStay() {
    $("#areas").innerHTML = S.areas.map(function (a) { return '<div class="area panel"><b>' + esc(L(a.n)) + "</b><p>" + esc(L(a.d)) + '</p><div class="tags">' + L(a.t).map(function (x) { return "<span>" + esc(x) + "</span>"; }).join("") + "</div></div>"; }).join("");
    $("#listings").innerHTML = S.listings.map(function (l) {
      return '<div class="listing panel"><span class="example">' + esc(t("stay.example")) + '</span><div class="ph">' + icon(l.icon) + '</div><div class="tx"><b>' + esc(L(l.n)) + "</b><small>" + esc(L(l.s)) + "</small></div></div>";
    }).join("") + '<a class="listing panel cta" href="#biz"><b>' + esc(t("stay.ctaT")) + '</b><span class="btn primary small">' + esc(t("stay.ctaB")) + "</span></a>";
  }
  function renderBiz() {
    $("#cats").innerHTML = t("cats").map(function (c) { return "<span>" + esc(c) + "</span>"; }).join("");
    var sel = $("#f-type"), v = sel.value;
    sel.innerHTML = t("cats").map(function (c, i) { return '<option value="' + i + '">' + esc(c) + "</option>"; }).join("");
    if (v) sel.value = v;
    $("#perks").innerHTML = [["card", "biz.p1"], ["pin", "biz.p2"], ["leaf", "biz.p3"]].map(function (p) { return "<li>" + icon(p[0]) + "<span>" + esc(t(p[1])) + "</span></li>"; }).join("");
  }
  function renderKnow() {
    $("#know-grid").innerHTML = S.know.map(function (k) { return '<div class="panel"><b>' + esc(money(k.b)) + "</b><span>" + esc(L(k.s)) + "</span></div>"; }).join("");
  }
  function renderCredits() {
    var ps = D.photos || {}, seen = {}, items = [];
    Object.keys(ps).forEach(function (k) { var p = ps[k]; if (seen[p.page]) return; seen[p.page] = 1; items.push('<li><a href="' + esc(p.page) + '" target="_blank" rel="noopener">' + esc(p.title) + "</a> · " + esc(p.author) + " · " + esc(p.license) + "</li>"); });
    $("#credits").innerHTML = items.join("");
  }

  /* ---------- form ---------- */
  function initForm() {
    var f = $("#biz-form"), out = $("#f-out");
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      var name = $("#f-name").value.trim(), contact = $("#f-contact").value.trim();
      if (!name || !contact) { out.className = "err"; out.textContent = t("biz.req"); return; }
      if ($("#f-hp").checked) return;
      var btn = $("button[type=submit]", f); btn.disabled = true; btn.textContent = t("biz.sending");
      var type = t("cats")[+$("#f-type").value] || "";
      fetch("https://api.web3forms.com/submit", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ access_key: "5394e22e-e672-40e2-8707-bd712abeac95", subject: "MonTop " + (P.name || "") + ": " + type + " · " + name, from_name: "MonTop " + (P.name || ""),
          type: type, name: name, place: $("#f-where").value.trim(), contact: contact, message: $("#f-msg").value.trim(), language: lang }) })
        .then(function (r) { return r.json(); }).then(function (j) {
          if (!j.success) throw 0;
          out.className = "ok"; out.textContent = t("biz.ok"); f.reset();
        }).catch(function () { out.className = "err"; out.textContent = t("biz.err"); })
        .then(function () { btn.disabled = false; btn.textContent = t("biz.send"); });
    });
  }

  /* ---------- events ---------- */
  function setLang(l) { lang = l; store.set("mt-lang", lang); renderAll(); if (!$("#sheet").hidden) route(); }
  // EN writes the euro sign first (€5), ME and RU after the number (5 €)
  function money(v) { var m = lang === "en" && /^(\d+(?:[.,]\d+)?)\s?€$/.exec(String(v)); return m ? "€" + m[1] : v; }
  function bind() {
    var lsel = $("[data-lang-sel]"); if (lsel) lsel.addEventListener("change", function () { setLang(lsel.value); });
    document.addEventListener("click", function (e) {
      var el = e.target.closest("[data-mode-cycle],[data-lang],[data-season],[data-f],[data-d],[data-gs],[data-gl],[data-close],[data-print],[data-copy],[data-map-toggle],[data-season-cycle],.pick[data-drive]");
      if (!el) return;
      if (el.hasAttribute("data-lang")) { setLang(el.getAttribute("data-lang")); }
      else if (el.hasAttribute("data-season") && el.tagName === "BUTTON") { setSeason(el.getAttribute("data-season")); }
      else if (el.hasAttribute("data-mode-cycle")) { mode = MODES[(MODES.indexOf(mode) + 1) % 3]; store.set("mt-mode", mode); setPhase(); }
      else if (el.hasAttribute("data-season-cycle")) { var o = S.order; setSeason(o[(o.indexOf(season) + 1) % 4]); }
      else if (el.hasAttribute("data-f")) { filter = el.getAttribute("data-f"); renderFilters(); renderTrails(); }
      else if (el.hasAttribute("data-d")) { curDrive = el.getAttribute("data-d"); renderDrives(); }
      else if (el.hasAttribute("data-gs")) { setSeason(el.getAttribute("data-gs")); }
      else if (el.hasAttribute("data-gl")) { gearLvl = el.getAttribute("data-gl"); renderGear(); }
      else if (el.hasAttribute("data-close")) { closeSheet(); }
      else if (el.hasAttribute("data-print")) { window.print(); }
      else if (el.hasAttribute("data-copy")) { copyText(el.getAttribute("data-copy"), el); }
      else if (el.hasAttribute("data-map-toggle")) { var mb = $("#mapbox"); mb.classList.toggle("collapsed"); el.textContent = t(mb.classList.contains("collapsed") ? "map.show" : "map.hide"); if (!mb.classList.contains("collapsed")) { initOverview(); setTimeout(function () { overview && overview.invalidateSize(); }, 50); } }
      else if (el.classList.contains("pick") && el.getAttribute("data-drive")) { curDrive = el.getAttribute("data-drive"); renderDrives(); }
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !$("#sheet").hidden) closeSheet(); });
    $("#sheet .scrim").addEventListener("click", closeSheet);
    window.addEventListener("hashchange", route);
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (en) {
          if (!en.isIntersecting) return;
          if (en.target.id === "trails" && window.innerWidth > 900) initOverview();
          if (en.target.id === "roads" && !driveSeen) { driveSeen = true; if (L_) drawDrive(); }
        });
      }, { rootMargin: "300px" });
      io.observe($("#trails")); io.observe($("#roads"));
    } else { initOverview(); driveSeen = true; drawDrive(); }
  }

  function renderAll() {
    applyStatic(); setSeason(season); renderNature(); renderFilters(); renderTrails(); renderDrives(); renderStay(); renderBiz(); renderKnow(); renderCredits(); renderWeather();
    var mt = $("[data-map-toggle]"); if (mt) mt.textContent = t($("#mapbox").classList.contains("collapsed") ? "map.show" : "map.hide");
    declutter();
  }

  document.documentElement.setAttribute("data-season", season);
  setPhase(); setInterval(setPhase, 60 * 1000);
  window.addEventListener("resize", placeSky);
  if (window.innerWidth <= 900) $("#mapbox").classList.add("collapsed");
  renderAll(); bind(); parallax(); initForm(); fetchWeather(); route();
})();
