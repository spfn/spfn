import Header from '@/components/Header';
import Hero from '@/components/Hero';
import WhenYouNeed from '@/components/WhenYouNeed';
import QuickStart from '@/components/QuickStart';
import HowItWorks from '@/components/HowItWorks';
import Features from '@/components/Features';
import Architecture from '@/components/Architecture';
import Footer from '@/components/Footer';

export default function Home()
{
    return (
        <>
            <Header />
            <main className="min-h-screen">
                <Hero />
                <WhenYouNeed />
                <QuickStart />
                <HowItWorks />
                <Features />
                <Architecture />
                <Footer />
            </main>
        </>
    );
}
