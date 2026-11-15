import type { Connector } from '../lib/connectors/types';

/** The connector's round icon. Decorative: buttons carry the connector name as text or a label. */
export function ConnectorIcon({ connector, size = 18 }: { connector: Connector; size?: number }) {
  const glyph = Math.round(size * 0.66);
  return (
    <span class="gp-cn-icon" style={{ background: connector.color, width: `${size}px`, height: `${size}px` }} aria-hidden="true">
      <svg viewBox="0 0 24 24" width={glyph} height={glyph} focusable="false">
        <path d={connector.iconPath} fill="#fff" />
      </svg>
    </span>
  );
}
