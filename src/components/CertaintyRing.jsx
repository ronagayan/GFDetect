import { useEffect, useState } from 'react'

const STATUS_COLOR = {
  safe:      '#22c55e',
  unsafe:    '#f87171',
  uncertain: '#fbbf24',
}

export default function CertaintyRing({ percentage = 0, status = 'uncertain', size = 96 }) {
  const [animated, setAnimated] = useState(0)
  const radius = (size - 12) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (animated / 100) * circumference
  const color = STATUS_COLOR[status] ?? '#8b5cf6'
  const cx = size / 2
  const cy = size / 2

  useEffect(() => {
    // Animate from 0 to percentage on mount
    const timeout = setTimeout(() => setAnimated(percentage), 80)
    return () => clearTimeout(timeout)
  }, [percentage])

  return (
    <div className="certainty-ring-wrap">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block' }}>
        {/* Track */}
        <circle
          cx={cx} cy={cy} r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="8"
        />
        {/* Fill */}
        <circle
          cx={cx} cy={cy} r={radius}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{
            transition: 'stroke-dashoffset 1s cubic-bezier(0.34, 1.56, 0.64, 1)',
            filter: `drop-shadow(0 0 6px ${color}66)`,
          }}
        />
        {/* Text */}
        <text
          x="50%" y="46%"
          textAnchor="middle"
          dominantBaseline="middle"
          fill={color}
          fontSize={size * 0.22}
          fontWeight="800"
          fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif"
        >
          {animated}%
        </text>
        <text
          x="50%" y="70%"
          textAnchor="middle"
          dominantBaseline="middle"
          fill="rgba(148,163,184,0.8)"
          fontSize={size * 0.11}
          fontWeight="500"
          fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif"
        >
          certain
        </text>
      </svg>
    </div>
  )
}
