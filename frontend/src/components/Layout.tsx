import React from 'react';

interface LayoutProps {
    children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
    return (
        <div className="min-h-screen bg-[var(--color-background)] text-[var(--color-text)]">
            {/* Header */}
            <header className="glass sticky top-0 z-50 border-b border-[var(--color-border)]">
                <div className="container mx-auto px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <img src="/logo.png" alt="Logo" className="w-8 h-8 rounded-lg shadow-sm" />
                        <h1 className="text-xl font-semibold">HFManager</h1>
                    </div>
                    <nav className="flex gap-2">
                        <NavButton active>搜索</NavButton>
                        <NavButton>下载队列</NavButton>
                        <NavButton>缓存</NavButton>
                        <NavButton>设置</NavButton>
                    </nav>
                </div>
            </header>

            {/* Main Content */}
            <main className="container mx-auto px-4 py-6">
                {children}
            </main>
        </div>
    );
}

interface NavButtonProps {
    children: React.ReactNode;
    active?: boolean;
    onClick?: () => void;
}

function NavButton({ children, active, onClick }: NavButtonProps) {
    return (
        <button
            onClick={onClick}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200
        ${active
                    ? 'bg-[var(--color-primary)] text-white'
                    : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]'
                }`}
        >
            {children}
        </button>
    );
}
