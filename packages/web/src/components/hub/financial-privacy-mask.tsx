'use client';

import { useEffect, useRef } from 'react';
import { usePrivacy } from '@/lib/privacy-context';

/**
 * Keeps the application usable during screen sharing while replacing only
 * monetary readings in the rendered UI. This intentionally runs on DOM text
 * nodes so future dashboards and popovers inherit privacy protection without
 * every financial component needing bespoke masking code.
 */
const MONEY_RE = /(?:R\$|US\$|USD|EUR|€|GBP|£)\s*[-−]?\s*(?:\d{1,3}(?:[.\s,]\d{3})*|\d+)(?:[.,]\d{2})?/giu;

function isMaskableText(node: Text) {
  const parent = node.parentElement;
  return Boolean(parent && !['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA'].includes(parent.tagName));
}

export function FinancialPrivacyMask() {
  const { isPrivate } = usePrivacy();
  const originalText = useRef(new Map<Text, string>());
  const mutating = useRef(false);

  useEffect(() => {
    const restore = () => {
      mutating.current = true;
      for (const [node, value] of originalText.current) {
        if (node.isConnected) node.data = value;
      }
      originalText.current.clear();
      mutating.current = false;
    };

    if (!isPrivate) {
      restore();
      return;
    }

    const maskNode = (node: Text) => {
      if (!isMaskableText(node) || !MONEY_RE.test(node.data)) return;
      MONEY_RE.lastIndex = 0;
      const raw = node.data;
      if (!originalText.current.has(node) || raw !== raw.replace(MONEY_RE, '****')) {
        originalText.current.set(node, raw);
      }
      MONEY_RE.lastIndex = 0;
      const masked = raw.replace(MONEY_RE, '****');
      if (masked !== raw) {
        mutating.current = true;
        node.data = masked;
        mutating.current = false;
      }
    };

    const maskTree = (root: Node) => {
      if (root.nodeType === Node.TEXT_NODE) maskNode(root as Text);
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let current = walker.nextNode();
      while (current) {
        maskNode(current as Text);
        current = walker.nextNode();
      }
    };

    maskTree(document.body);
    const observer = new MutationObserver((records) => {
      if (mutating.current) return;
      for (const record of records) {
        if (record.type === 'characterData') maskNode(record.target as Text);
        for (const node of record.addedNodes) maskTree(node);
      }
    });
    observer.observe(document.body, { childList: true, characterData: true, subtree: true });

    return () => {
      observer.disconnect();
      restore();
    };
  }, [isPrivate]);

  return null;
}
