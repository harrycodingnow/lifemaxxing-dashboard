// Hermes mock harness. Tests configure a "responder" — a function that takes
// the prompt text and returns a canned hermes stdout string. The default
// responder throws so tests that don't set one fail loudly.

type Responder = (prompt: string) => string | Promise<string>;

let responder: Responder = (prompt: string) => {
  throw new Error(
    `hermes called with no responder configured. First 200 chars:\n${prompt.slice(0, 200)}`,
  );
};

export function setHermesResponder(r: Responder) {
  responder = r;
}

export function resetHermesResponder() {
  responder = (prompt: string) => {
    throw new Error(`hermes called with no responder configured. ${prompt.slice(0, 60)}`);
  };
}

export function getHermesResponder(): Responder {
  return responder;
}
