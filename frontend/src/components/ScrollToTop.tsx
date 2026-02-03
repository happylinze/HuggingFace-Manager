import { useState, useEffect } from 'react';

interface ScrollToTopProps {
    containerRef?: React.RefObject<HTMLDivElement | null>;
}

export function ScrollToTop({ containerRef }: ScrollToTopProps) {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const target = containerRef?.current || window;

        const toggleVisibility = () => {
            if (containerRef?.current) {
                if (containerRef.current.scrollTop > 300) setIsVisible(true);
                else setIsVisible(false);
            } else {
                if (window.scrollY > 300) setIsVisible(true);
                else setIsVisible(false);
            }
        };

        target.addEventListener('scroll', toggleVisibility);
        return () => target.removeEventListener('scroll', toggleVisibility);
    }, [containerRef]);

    const scrollToTop = () => {
        if (containerRef?.current) {
            containerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };

    return (
        <button
            onClick={scrollToTop}
            className={`fixed bottom-20 right-4 p-3 rounded-full bg-[var(--color-primary)] text-white shadow-lg shadow-indigo-500/30 hover:bg-[var(--color-primary)]/80 hover:-translate-y-1 transition-all duration-300 z-[200] ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10 pointer-events-none'}`}
            title="Scroll to Top"
        >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 15l-6-6-6 6" />
            </svg>
        </button>
    );
}
