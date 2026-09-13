export interface WeatherNow {
  tempC: number;
  feelsC: number;
  humidity: number;
  wind: number;
  gust?: number;
  precip?: number;
  cloud?: number;
  pressure?: number;
  code: number;
  isDay: boolean;
  place: string;
  region: string;
  lat: number;
  lon: number;
  accuracyM: number | null;
  daily: { day: string; max: number; min: number; code: number }[];
  updatedAt: number;
  source: "gps" | "ip" | "pinned" | "fallback";
}

export interface Place {
  name: string;
  region: string;
  lat: number;
  lon: number;
}

const LAST_LOC = "ripple.coords.v2";
const PIN_KEY = "ripple.pinned-place.v1";
const to = (ms: number) => {
  const c = new AbortController();
  window.setTimeout(() => c.abort(), ms);
  return c.signal;
};

async function json<T>(url: string, ms: number): Promise<T> {
  const r = await fetch(url, { signal: to(ms) });
  if (!r.ok) throw new Error(String(r.status));
  return (await r.json()) as T;
}

/* ------------------------------------------------------------------ */
/*  Location — GPS first with accuracy gating, then IP, then default   */
/* ------------------------------------------------------------------ */

interface Loc {
  lat: number;
  lon: number;
  place: string;
  region: string;
  accuracyM: number | null;
  source: WeatherNow["source"];
}

const cacheLoc = (l: Loc) => {
  try {
    localStorage.setItem(LAST_LOC, JSON.stringify({ ...l, at: Date.now() }));
  } catch {
    /* noop */
  }
};

async function locate(force = false): Promise<Loc> {
  // cached GPS less than 20 min old is reused so live refreshes don't re-prompt
  if (!force) {
    try {
      const raw = localStorage.getItem(LAST_LOC);
      if (raw) {
        const c = JSON.parse(raw);
        if (c?.lat && Date.now() - c.at < 20 * 60 * 1000) {
          return { lat: c.lat, lon: c.lon, place: c.place, region: c.region, accuracyM: c.accuracyM ?? null, source: c.source };
        }
      }
    } catch {
      /* noop */
    }
  }

  try {
    const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error("no geo"));
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        timeout: 11000,
        maximumAge: 300_000,
        enableHighAccuracy: true, // real fix: GPS-grade coords instead of coarse wifi fix
      });
    });
    const { latitude: lat, longitude: lon, accuracy } = pos.coords;
    let place = "Your location";
    let region = "";
    try {
      const rev = await json<any>(
        `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`,
        7000
      );
      place = rev.city || rev.locality || rev.principalSubdivision || place;
      region = [rev.principalSubdivision, rev.countryName].filter(Boolean).join(", ");
    } catch {
      /* keep generic label */
    }
    const loc: Loc = { lat, lon, place, region, accuracyM: Number.isFinite(accuracy) ? Math.round(accuracy) : null, source: "gps" };
    cacheLoc(loc);
    return loc;
  } catch {
    /* fall through to IP */
  }

  try {
    const ip = await json<any>("https://ipapi.co/json/", 7000);
    if (typeof ip?.latitude === "number") {
      const loc: Loc = {
        lat: ip.latitude,
        lon: ip.longitude,
        place: ip.city || ip.region || "Detected",
        region: [ip.region, ip.country_name].filter(Boolean).join(", "),
        accuracyM: null,
        source: "ip",
      };
      cacheLoc(loc);
      return loc;
    }
  } catch {
    /* final fallback */
  }

  const fb: Loc = {
    lat: 28.6139,
    lon: 77.209,
    place: "New Delhi",
    region: "Delhi, India",
    accuracyM: null,
    source: "fallback",
  };
  return fb;
}

/* ------------------------------------------------------------------ */
/*  Live weather                                                      */
/* ------------------------------------------------------------------ */

export async function fetchWeather(forceLocate = false): Promise<WeatherNow> {
  const pinned = getPinnedPlace();
  const loc = pinned
    ? { lat: pinned.lat, lon: pinned.lon, place: pinned.name, region: pinned.region, accuracyM: null, source: "pinned" as const }
    : await locate(forceLocate);

  const d = await json<any>(
    `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}` +
      `&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_gusts_10m` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min&forecast_days=4&timezone=auto&wind_speed_unit=kmh`,
    9000
  );

  const c = d.current;
  return {
    tempC: c.temperature_2m,
    feelsC: c.apparent_temperature,
    humidity: c.relative_humidity_2m,
    wind: c.wind_speed_10m,
    gust: c.wind_gusts_10m,
    precip: c.precipitation,
    cloud: c.cloud_cover,
    pressure: c.pressure_msl,
    code: c.weather_code,
    isDay: !!c.is_day,
    place: loc.place,
    region: loc.region,
    lat: loc.lat,
    lon: loc.lon,
    accuracyM: loc.accuracyM,
    daily: (d.daily?.time || []).map((t: string, i: number) => ({
      day: t,
      max: d.daily.temperature_2m_max[i],
      min: d.daily.temperature_2m_min[i],
      code: d.daily.weather_code[i],
    })),
    updatedAt: Date.now(),
    source: loc.source,
  };
}

/** Free, keyless city search so users can pin an exact place. */
export async function searchPlaces(q: string): Promise<Place[]> {
  if (q.trim().length < 2) return [];
  try {
    const d = await json<any>(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q.trim())}&count=6&language=en&format=json`,
      7000
    );
    return (d?.results || []).map((r: any) => ({
      name: r.name,
      region: [r.admin1, r.country].filter(Boolean).join(", "),
      lat: r.latitude,
      lon: r.longitude,
    }));
  } catch {
    return [];
  }
}

export function getPinnedPlace(): Place | null {
  try {
    const raw = localStorage.getItem(PIN_KEY);
    return raw ? (JSON.parse(raw) as Place) : null;
  } catch {
    return null;
  }
}

export function pinPlace(p: Place | null) {
  try {
    if (p) localStorage.setItem(PIN_KEY, JSON.stringify(p));
    else localStorage.removeItem(PIN_KEY);
  } catch {
    /* noop */
  }
}

export const WMO: Record<number, { label: string; kind: string }> = {
  0: { label: "Clear sky", kind: "clear" },
  1: { label: "Mainly clear", kind: "clear" },
  2: { label: "Partly cloudy", kind: "partly" },
  3: { label: "Overcast", kind: "cloudy" },
  45: { label: "Foggy", kind: "fog" },
  48: { label: "Freezing fog", kind: "fog" },
  51: { label: "Light drizzle", kind: "rain" },
  53: { label: "Drizzle", kind: "rain" },
  55: { label: "Heavy drizzle", kind: "rain" },
  56: { label: "Freezing drizzle", kind: "rain" },
  57: { label: "Freezing drizzle", kind: "rain" },
  61: { label: "Light rain", kind: "rain" },
  63: { label: "Rain", kind: "rain" },
  65: { label: "Heavy rain", kind: "rain" },
  66: { label: "Freezing rain", kind: "rain" },
  67: { label: "Freezing rain", kind: "rain" },
  71: { label: "Light snow", kind: "snow" },
  73: { label: "Snow", kind: "snow" },
  75: { label: "Heavy snow", kind: "snow" },
  77: { label: "Snow grains", kind: "snow" },
  80: { label: "Light showers", kind: "rain" },
  81: { label: "Showers", kind: "rain" },
  82: { label: "Violent showers", kind: "rain" },
  85: { label: "Snow showers", kind: "snow" },
  86: { label: "Snow showers", kind: "snow" },
  95: { label: "Thunderstorm", kind: "storm" },
  96: { label: "Storm + hail", kind: "storm" },
  99: { label: "Storm + hail", kind: "storm" },
};

export const toUnit = (c: number, unit: "c" | "f") => (unit === "f" ? c * 9 / 5 + 32 : c);
export const unitLabel = (unit: "c" | "f") => (unit === "f" ? "°F" : "°C");
export const ago = (ts: number) => Math.max(0, Math.round((Date.now() - ts) / 1000));
