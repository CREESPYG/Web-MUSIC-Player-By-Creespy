function splitScTitle(title, defaultAuthor) {
  const m = title.match(/^(.*?)\s+by\s+(.+)$/);
  if (m) return { title: m[1].trim(), artist: m[2].trim() };
  return { title, artist: defaultAuthor };
}

const cases = [
  ["Flickermood by Forss", "Forss"],
  ["Drift by French 79", "French 79"],
  ["Some Track", "Author"],
  ["One by one", "Author"],
];

for (const [t, d] of cases) console.log(JSON.stringify(t), "=>", JSON.stringify(splitScTitle(t, d)));