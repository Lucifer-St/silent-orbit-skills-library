import { useCallback, useMemo, useRef, useState } from "react";
import type { PersonalDataV1 } from "../types";
import {
  deleteOutcome as removeOutcome,
  emptyPersonalData,
  tryRecordOutcome,
  updateOutcome as editOutcome,
} from "../lib/outcomePolicy";
import type { OutcomeDraft, OutcomeUpdateDraft } from "../lib/outcomePolicy";
import { createPersonalStore } from "../lib/personalStore";
import type { PersonalStore } from "../lib/personalStore";

interface PersonalOutcomeState {
  readonly data: PersonalDataV1;
  readonly error: string | null;
}

function immutableSnapshot(data: PersonalDataV1): PersonalDataV1 {
  const outcomes = Object.freeze(data.outcomes.map((outcome) => Object.freeze({ ...outcome })));
  const tombstones = Object.freeze(data.tombstones.map((tombstone) => Object.freeze({ ...tombstone })));
  return Object.freeze({ schemaVersion: 1, outcomes, tombstones });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Personal data storage is unavailable";
}

export function usePersonalOutcomes() {
  const storeRef = useRef<PersonalStore | null>(null);
  const initialRef = useRef<PersonalOutcomeState | null>(null);

  if (initialRef.current === null) {
    try {
      const store = createPersonalStore(window.localStorage);
      storeRef.current = store;
      initialRef.current = { data: immutableSnapshot(store.load()), error: null };
    } catch (error) {
      initialRef.current = { data: immutableSnapshot(emptyPersonalData()), error: errorMessage(error) };
    }
  }

  const [state, setState] = useState<PersonalOutcomeState>(initialRef.current);
  const dataRef = useRef(state.data);
  dataRef.current = state.data;

  const commit = useCallback((nextData: PersonalDataV1): boolean => {
    const store = storeRef.current;
    if (!store) {
      setState((current) => ({ ...current, error: "Personal data storage is unavailable" }));
      return false;
    }

    try {
      store.replace(nextData);
      const data = immutableSnapshot(nextData);
      dataRef.current = data;
      setState({ data, error: null });
      return true;
    } catch (error) {
      setState((current) => ({ ...current, error: errorMessage(error) }));
      return false;
    }
  }, []);

  const recordOutcome = useCallback((input: OutcomeDraft): boolean => {
    const now = new Date();
    const attempt = tryRecordOutcome(dataRef.current, input, now);
    if (!attempt.allowed) {
      setState((current) => ({ ...current, error: "Outcome could not be saved right now." }));
      return false;
    }
    return commit(attempt.data);
  }, [commit]);

  const updateOutcome = useCallback((id: string, input: OutcomeUpdateDraft): boolean => {
    try {
      return commit(editOutcome(dataRef.current, id, input));
    } catch (error) {
      setState((current) => ({ ...current, error: errorMessage(error) }));
      return false;
    }
  }, [commit]);

  const deleteOutcome = useCallback(
    (id: string) => commit(removeOutcome(dataRef.current, id, new Date()).data),
    [commit],
  );

  const exportData = useCallback((): string => {
    try {
      return JSON.stringify(dataRef.current, null, 2);
    } catch (error) {
      setState((current) => ({ ...current, error: errorMessage(error) }));
      return "";
    }
  }, []);

  const importData = useCallback((json: string): boolean => {
    const store = storeRef.current;
    if (!store) {
      setState((current) => ({ ...current, error: "Personal data storage is unavailable" }));
      return false;
    }

    try {
      store.importJson(json);
      const data = immutableSnapshot(store.load());
      dataRef.current = data;
      setState({ data, error: null });
      return true;
    } catch (error) {
      setState((current) => ({ ...current, error: errorMessage(error) }));
      return false;
    }
  }, []);

  return useMemo(
    () => ({
      data: state.data,
      error: state.error,
      recordOutcome,
      updateOutcome,
      deleteOutcome,
      exportData,
      importData,
    }),
    [deleteOutcome, exportData, importData, recordOutcome, state.data, state.error, updateOutcome],
  );
}
