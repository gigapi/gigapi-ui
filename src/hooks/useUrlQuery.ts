import { useCallback } from 'react';
import { useSetAtom } from 'jotai';
import { HashQueryUtils } from '@/lib/url/hash-query-utils';
import { setQueryAtom } from '@/atoms';
import { setSelectedDbAtom, selectedTableAtom } from '@/atoms';
import { setTimeRangeAtom, selectedTimeFieldAtom } from '@/atoms';
import type { HashQueryParams } from '@/types/utils.types';

/**
 * Hook to handle URL-based query parameter loading and management
 */
export function useUrlQuery() {
  const setQuery = useSetAtom(setQueryAtom);
  const setSelectedDb = useSetAtom(setSelectedDbAtom);
  const setSelectedTable = useSetAtom(selectedTableAtom);
  const setTimeRange = useSetAtom(setTimeRangeAtom);
  const setSelectedTimeField = useSetAtom(selectedTimeFieldAtom);

  /**
   * Load query parameters from URL hash and apply them to contexts
   */
  const loadFromUrl = useCallback(async () => {
    try {
      const params = HashQueryUtils.decodeHashQuery();
      if (!params) return;

      // Apply database selection
      if (params.db) {
        setSelectedDb(params.db);
      }

      // Apply table selection
      if (params.table) {
        setSelectedTable(params.table);
      }

      // Apply time field selection
      if (params.timeField) {
        setSelectedTimeField(params.timeField);
      }

      // Apply time range
      if (params.timeFrom || params.timeTo) {
        setTimeRange({
          type: 'relative',
          from: params.timeFrom || '15m',
          to: params.timeTo || 'now',
        });
      }

      // Apply query (do this last so all context is set up)
      if (params.query) {
        setQuery(params.query);
      }

    } catch (error) {
      console.error('Failed to load URL parameters:', error);
    }
  }, [setQuery, setSelectedDb, setSelectedTable, setTimeRange, setSelectedTimeField]);

  /**
   * Update URL hash with current query parameters
   */
  const updateUrl = useCallback((params: HashQueryParams) => {
    HashQueryUtils.updateHash(params);
  }, []);

  /**
   * Generate shareable URL with current parameters
   */
  const generateShareableUrl = useCallback((params: HashQueryParams) => {
    return HashQueryUtils.generateShareableUrl(params);
  }, []);

  /**
   * Copy shareable URL to clipboard
   */
  const copyShareableUrl = useCallback(async (params: HashQueryParams) => {
    return await HashQueryUtils.copyShareableUrl(params);
  }, []);

  return {
    loadFromUrl,
    updateUrl,
    generateShareableUrl,
    copyShareableUrl,
  };
}
