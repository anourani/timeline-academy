import { Link } from 'react-router-dom'

interface LegalLayoutProps {
  title: string
  lastUpdated: string
  children: React.ReactNode
}

export function LegalLayout({ title, lastUpdated, children }: LegalLayoutProps) {
  return (
    <div className="min-h-screen bg-black text-white overflow-auto">
      <div className="max-w-2xl mx-auto px-6 py-12">
        <Link
          to="/"
          className="text-sm text-[#9b9ea3] hover:text-[#dadee5] transition-colors"
        >
          ← Timeline Academy
        </Link>
        <h1 className="font-['Aleo',serif] text-[28px] leading-[1.3] mt-6 mb-1">
          {title}
        </h1>
        <p className="text-sm text-[#6b6e73] mb-8">Last updated: {lastUpdated}</p>
        <div className="space-y-6 text-[15px] leading-[1.6] text-[#c9ced4] [&_h2]:font-['Aleo',serif] [&_h2]:text-[18px] [&_h2]:text-white [&_h2]:mt-8 [&_h2]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_a]:underline [&_a]:hover:text-white">
          {children}
        </div>
      </div>
    </div>
  )
}
