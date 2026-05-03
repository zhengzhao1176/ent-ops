type Transition = { from: number; to: number; action: string };

const TRANSITIONS: Record<string, Transition[]> = {
  Inbound: [
    { from: 10, to: 20, action: 'submit' },
    { from: 20, to: 30, action: 'audit' },
    { from: 30, to: 40, action: 'finish' },
    { from: 10, to: 90, action: 'void' },
    { from: 20, to: 90, action: 'void' },
  ],
  Outbound: [
    { from: 10, to: 20, action: 'submit' },
    { from: 20, to: 25, action: 'audit' },
    { from: 25, to: 30, action: 'ship' },
    { from: 30, to: 40, action: 'finish' },
    { from: 10, to: 90, action: 'void' },
    { from: 20, to: 90, action: 'void' },
  ],
  Transfer: [
    { from: 10, to: 20, action: 'submit' },
    { from: 20, to: 25, action: 'audit' },
    { from: 25, to: 30, action: 'receive' },
    { from: 30, to: 40, action: 'finish' },
    { from: 10, to: 90, action: 'void' },
    { from: 20, to: 90, action: 'void' },
  ],
  // Stocktake lifecycle:
  //   10 = draft      → freeze → 20
  //   20 = frozen     → submit → 25
  //   25 = submitted  → commit → 30  (auto-generates gain/loss inbound/outbound)
  //   30 = committed  → finish → 40
  //   90 = cancelled  (allowed from 10 / 20 only — once stock has been
  //                    materially adjusted in commit, cancel is illegal)
  Stocktake: [
    { from: 10, to: 20, action: 'freeze' },
    { from: 20, to: 25, action: 'submit' },
    { from: 25, to: 30, action: 'commit' },
    { from: 30, to: 40, action: 'finish' },
    { from: 10, to: 90, action: 'cancel' },
    { from: 20, to: 90, action: 'cancel' },
  ],
};

export function validateTransition(entity: string, from: number, to: number): void {
  const list = TRANSITIONS[entity];
  if (!list) throw new Error(`UNKNOWN_ENTITY:${entity}`);
  if (!list.some((t) => t.from === from && t.to === to)) {
    throw new Error(`ILLEGAL_TRANSITION:${entity}:${from}->${to}`);
  }
}

export function findAction(entity: string, from: number, to: number): string {
  const list = TRANSITIONS[entity] ?? [];
  const t = list.find((x) => x.from === from && x.to === to);
  if (!t) throw new Error(`ILLEGAL_TRANSITION:${entity}:${from}->${to}`);
  return t.action;
}
