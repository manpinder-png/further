"use client";

import { useState } from "react";
import type { GeomindNeighbor } from "@/lib/geomind";
import { CloseIcon, Head } from "@/components/ui/bits";
import { OperationStatus } from "@/components/activity/ActivityPanel";

export default function GeomindInspector({ peer, onClose, onInvite, inviting, checking, error }: { peer: GeomindNeighbor | null; onClose: () => void; onInvite: (peerId: string, conceptSlug: string, peerConceptSlug?: string) => void; inviting: boolean; checking: boolean; error: string | null }) {
  const [chosenSlug, setChosenSlug] = useState<string | null>(null);
  const pairs = peer?.topicPairs?.length ? peer.topicPairs : peer?.sharedTopics.map(item => ({ ownTopic: item, peerTopic: item, similarity: 1 })) ?? [];
  const pairKey = (pair: typeof pairs[number]) => `${pair.ownTopic.slug}:${pair.peerTopic.slug}`;
  const topic = pairs.find(item => pairKey(item) === chosenSlug) ?? pairs[0];
  return <article className="flex h-full min-h-0 flex-col">
    <header className="flex h-10 shrink-0 items-center justify-between border-b border-line pl-4 pr-1"><h2 className="label">{peer ? "Nearby learner" : "Geomind"}</h2>{peer && <button className="btn btn-icon btn-ghost border-transparent" onClick={onClose} aria-label="Close learner details"><CloseIcon /></button>}</header>
    <div className="scroll min-h-0 flex-1 px-4 py-5">{peer ? <>
      <div className="flex items-center gap-3"><Head name={peer.name} color="#4ddfe6" size={42} /><div className="min-w-0"><h3 className="break-words text-xl font-semibold">{peer.name}</h3><p className="mt-1 text-xs text-muted"><span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-success" />Available now · {peer.commonMinutes} minutes in common</p></div></div>
      <h4 className="label mt-6">Why you’re nearby</h4>
      <p className="mt-2 text-sm leading-relaxed text-muted">Your learning connects through {pairs.length === 1 ? "a related idea" : `${pairs.length} related ideas`}. Different wording can still lead to a useful conversation.</p>
      {peer.reasons.filter(reason => reason.kind === "reviewed-explanation").slice(0, 2).map(reason => <p key={`${reason.slug}-${reason.kind}`} className="mt-3 text-sm leading-relaxed text-muted">{reason.kind === "reviewed-explanation" && <>{reason.by === "you" ? "You’ve" : `${peer.name} has`} tried an AI-reviewed explanation of {reason.title}. Compare approaches and ask each other questions.</>}</p>)}
      <fieldset className="mt-6" disabled={inviting}><legend className="label">Choose a starting point</legend><div className="mt-3 space-y-2">{pairs.map(item => <label key={pairKey(item)} className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm ${pairKey(item) === (topic ? pairKey(topic) : null) ? "border-mastery/50 bg-mastery-soft" : "border-line bg-panel-2"}`}><input type="radio" name="geomind-topic" checked={pairKey(item) === (topic ? pairKey(topic) : null)} onChange={() => setChosenSlug(pairKey(item))} className="mt-1 accent-[#4ddfe6]" /><span><span className="block">{item.ownTopic.title}</span>{item.peerTopic.slug !== item.ownTopic.slug && <span className="mt-1 block text-xs leading-relaxed text-muted">Connects with {peer.name}’s {item.peerTopic.title}</span>}</span></label>)}</div></fieldset>
      <button className="btn btn-primary mt-5 w-full" disabled={inviting || checking || !topic} onClick={() => { if (topic) onInvite(peer.id, topic.ownTopic.slug, topic.peerTopic.slug); }}>{inviting ? "Checking your invitation…" : checking ? "Refreshing availability…" : `Learn with ${peer.name}`}</button>
      <p className="mt-3 text-xs leading-relaxed text-muted">Both people choose whether to join. Your private questions, notes and explanations are not shared.</p>
    </> : <><h3 className="text-xl font-semibold">Find your people through ideas.</h3><p className="mt-3 text-sm leading-relaxed text-muted">Your knowledge map helps reveal people exploring related ideas, even when they use different words. Select someone to see what connects you and choose a topic to explore together.</p><div className="mt-6 border-y border-line py-4"><h4 className="text-sm font-medium">Available, by choice</h4><p className="mt-2 text-sm leading-relaxed text-muted">This view shows willing learners available now, with a common language and time to meet.</p></div><p className="mt-5 text-xs leading-relaxed text-muted">Distance from you reflects similarity between learning topics. Map positions are illustrative, and do not measure geographic distance or ability. An AI-reviewed explanation is evidence of practice.</p></>}
      {inviting && <div className="mt-4"><OperationStatus label="Peer guide · Checking your invitation" detail="Confirming you are both still available before opening the invitation." /></div>}
      {error && <p className="mt-4 text-sm text-err" role="alert">{error}</p>}
    </div>
  </article>;
}
