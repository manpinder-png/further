import type { GeomindNeighbor } from "./geomind";

function hash(text: string) {
  let value = 2166136261;
  for (const character of text) value = Math.imul(value ^ character.charCodeAt(0), 16777619);
  return (value >>> 0) / 4294967296;
}

/** Radius reflects semantic distance; bearing is stable decoration, not peer-to-peer distance. */
export function geomindLayout(peers: GeomindNeighbor[]) {
  const placed: Array<{ x: number; y: number }> = [];
  return [...peers].sort((a, b) => a.id.localeCompare(b.id)).map(peer => {
    const topic = peer.topicPairs?.[0]?.ownTopic ?? peer.sharedTopics[0];
    const similarity = peer.proximity.similarity ?? peer.proximity.overlap;
    const radius = 125 + Math.sqrt(Math.max(0, 1 - Math.max(-1, Math.min(1, similarity)))) * 790;
    let bearing = hash(topic?.slug ?? peer.id) * Math.PI * 2 + (hash(peer.id) - .5) * 1.25;
    let x = Math.cos(bearing) * radius, y = Math.sin(bearing) * radius;
    for (let attempt = 0; attempt < 64 && placed.some(point => Math.hypot(point.x - x, point.y - y) < 115); attempt++) {
      bearing += .41; x = Math.cos(bearing) * radius; y = Math.sin(bearing) * radius;
    }
    placed.push({ x, y });
    return { peer, x, y, radius, topic, bearing };
  });
}
