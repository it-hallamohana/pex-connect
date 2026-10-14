export default function AuthBackdrop() {
  return (
    <div className="auth-backdrop" aria-hidden="true">
      <div className="auth-glow auth-glow-one" />
      <div className="auth-glow auth-glow-two" />
      <svg
        className="auth-architecture"
        viewBox="0 0 1440 700"
        preserveAspectRatio="xMidYMax slice"
        fill="none"
      >
        <path d="M-80 620L470 360H970L1520 620M-80 530L470 280H970L1520 530M-80 440L470 200H970L1520 440" />
        <path d="M470 200V700M970 200V700M290 280V700M1150 280V700M110 360V700M1330 360V700" />
        <path d="M470 360L160 700M970 360L1280 700M640 360L580 700M800 360L860 700M0 620H1440M0 530H1440" />
        <path d="M590 360V250C590 155 850 155 850 250V360M620 360V260C620 195 820 195 820 260V360" />
        <path d="M460 420H980M410 470H1030M350 530H1090" />
        <rect x="500" y="275" width="55" height="70" rx="4" />
        <rect x="885" y="275" width="55" height="70" rx="4" />
      </svg>
      <span className="auth-brand-watermark">PEKANBARU XCHANGE</span>
    </div>
  );
}
