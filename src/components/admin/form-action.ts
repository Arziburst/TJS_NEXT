import { unstable_rethrow } from "next/navigation";
import { useActionState, useMemo } from "react";

/**
 * `action`, returning `failed` instead of throwing (#112). An action throws when the session cannot be read
 * (SessionUnavailableError, a moment's Auth outage), the server fails or the network drops; useActionState
 * would hand that to the page's error boundary and lose everything typed into the form. The form shows its
 * "try again" message instead. Next's own redirect and not-found signals pass through.
 */
export function keepFormOnThrow<State, Payload>(
  action: (previous: Awaited<State>, payload: Payload) => State | Promise<State>,
  failed: Awaited<State>,
): (previous: Awaited<State>, payload: Payload) => Promise<Awaited<State>> {
  return async (previous, payload): Promise<Awaited<State>> => {
    try {
      return await action(previous, payload);
    } catch (error) {
      unstable_rethrow(error);
      return failed;
    }
  };
}

/** useActionState for an admin form: a thrown action becomes the form's `failed` state (keepFormOnThrow). */
export function useFormActionState<State>(
  action: (previous: Awaited<State>, formData: FormData) => State | Promise<State>,
  initial: Awaited<State>,
  failed: Awaited<State>,
) {
  const safeAction = useMemo(() => keepFormOnThrow(action, failed), [action, failed]);
  return useActionState(safeAction, initial);
}
