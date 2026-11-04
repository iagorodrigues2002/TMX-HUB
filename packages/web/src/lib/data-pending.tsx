'use client';

import { createContext, useContext } from 'react';

/** Keep the surface mounted while its next data scope is being fetched. */
export const DataPendingContext = createContext(false);
export const useDataPending = () => useContext(DataPendingContext);
