import React, { useState } from 'react';
import { Menu, X, Video } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Modal } from '../Modal/Modal';

interface GlobalNavProps {
  onViewTimelinesClick: () => void;
  onSignInClick: () => void;
  onSignUpClick: () => void;
  timelineId: string | null;
}

export function GlobalNav({ 
  onViewTimelinesClick, 
  onSignInClick, 
  onSignUpClick,
  timelineId
}: GlobalNavProps) {
  const { user } = useAuth();
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isVideoTutorialOpen, setIsVideoTutorialOpen] = useState(false);

  const handlePresentMode = () => {
    if (timelineId) {
      window.open(`/view/${timelineId}`, '_blank');
    }
  };

  const handleShare = () => {
    if (timelineId) {
      const shareUrl = `${window.location.origin}/view/${timelineId}`;
      navigator.clipboard.writeText(shareUrl);
      alert('Share link copied to clipboard!');
    }
  };

  const handleFeedbackClick = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsHelpOpen(true);
  };

  const handleEmailClick = (e: React.MouseEvent) => {
    e.preventDefault();
    const mailtoLink = "mailto:alex@timeline.academy?subject=" + encodeURIComponent("I'm a timeline.academy user. Here's my feedback");
    window.location.href = mailtoLink;
  };

  const handleVideoTutorialClick = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsVideoTutorialOpen(true);
  };

  return (
    <div className="bg-black border-b border-gray-800">
      <div className="mx-auto px-8 py-2 flex justify-between items-center relative">
        {/* Left side - Menu button and Logo */}
        <div className="flex items-center gap-4">
          <button
            onClick={onViewTimelinesClick}
            className="text-gray-400 hover:text-white transition-colors p-2 hover:bg-gray-800 rounded-lg"
            aria-label="View Timelines"
          >
            <Menu size={20} />
          </button>
          
          <div className="text-white">
            <svg width="172" height="26" viewBox="0 0 145 22" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M3.936 16V5.952H0.288V4.496H9.312V5.952H5.68V16H3.936ZM2.768 16V15.264C2.768 15.1573 2.79467 15.072 2.848 15.008C2.90133 14.944 2.98133 14.9013 3.088 14.88L4.208 14.64L4.384 16H2.768ZM5.232 16L5.408 14.64L6.528 14.88C6.63467 14.9013 6.71467 14.944 6.768 15.008C6.82133 15.072 6.848 15.1573 6.848 15.264V16H5.232ZM7.92 5.552L9.312 5.952V7.392H8.544C8.448 7.392 8.368 7.37067 8.304 7.328C8.24 7.27467 8.192 7.18933 8.16 7.072L7.92 5.552ZM1.664 5.552L1.424 7.072C1.41333 7.18933 1.37067 7.27467 1.296 7.328C1.232 7.37067 1.152 7.392 1.056 7.392H0.288V5.952L1.664 5.552ZM11.2098 16V7.856H12.8098V16H11.2098ZM10.0418 16V15.264C10.0418 15.1573 10.0684 15.072 10.1217 15.008C10.1751 14.944 10.2551 14.9013 10.3618 14.88L11.4658 14.64L11.6578 16H10.0418ZM12.3458 16L12.5378 14.64L13.6578 14.88C13.7538 14.9013 13.8284 14.944 13.8818 15.008C13.9351 15.072 13.9618 15.1573 13.9618 15.264V16H12.3458ZM11.6578 7.856L11.4658 9.216L10.3618 8.976C10.2551 8.95467 10.1751 8.912 10.1217 8.848C10.0684 8.784 10.0418 8.69867 10.0418 8.592V7.856H11.6578ZM11.9938 6.432C11.7058 6.432 11.4498 6.32533 11.2258 6.112C11.0124 5.89867 10.9058 5.648 10.9058 5.36C10.9058 5.06133 11.0124 4.80533 11.2258 4.592C11.4498 4.368 11.7058 4.256 11.9938 4.256C12.2924 4.256 12.5484 4.368 12.7618 4.592C12.9858 4.80533 13.0978 5.06133 13.0978 5.36C13.0978 5.648 12.9858 5.89867 12.7618 6.112C12.5484 6.32533 12.2924 6.432 11.9938 6.432ZM15.8191 16V7.856H16.7791C17.0031 7.856 17.1418 7.96267 17.1951 8.176L17.3071 8.944C17.6058 8.592 17.9365 8.304 18.2991 8.08C18.6618 7.84533 19.0885 7.728 19.5791 7.728C20.1231 7.728 20.5605 7.87733 20.8911 8.176C21.2325 8.47467 21.4778 8.87467 21.6271 9.376C21.8618 8.81067 22.2138 8.39467 22.6831 8.128C23.1631 7.86133 23.6805 7.728 24.2351 7.728C25.1098 7.728 25.7818 8.00533 26.2511 8.56C26.7311 9.104 26.9711 9.856 26.9711 10.816V16H25.3711V10.816C25.3711 10.2187 25.2378 9.76533 24.9711 9.456C24.7151 9.14667 24.3365 8.992 23.8351 8.992C23.3658 8.992 22.9711 9.15733 22.6511 9.488C22.3418 9.808 22.1871 10.2507 22.1871 10.816V16H20.5871V10.816C20.5871 10.1973 20.4591 9.73867 20.2031 9.44C19.9578 9.14133 19.5951 8.992 19.1151 8.992C18.7845 8.992 18.4751 9.08267 18.1871 9.264C17.9098 9.43467 17.6538 9.66933 17.4191 9.968V16H15.8191ZM14.6511 16V15.264C14.6511 15.1573 14.6778 15.072 14.7311 15.008C14.7845 14.944 14.8645 14.9013 14.9711 14.88L16.0751 14.64L16.2671 16H14.6511ZM16.9551 16L17.1471 14.64L18.2671 14.88C18.3631 14.9013 18.4378 14.944 18.4911 15.008C18.5445 15.072 18.5711 15.1573 18.5711 15.264V16H16.9551ZM21.7231 16L21.9151 14.64L23.0351 14.88C23.1311 14.9013 23.2058 14.944 23.2591 15.008C23.3231 15.072 23.3551 15.1573 23.3551 15.264V16H21.7231ZM16.2671 7.856L16.0751 9.216L14.9711 8.976C14.8645 8.95467 14.7845 8.912 14.7311 8.848C14.6778 8.784 14.6511 8.69867 14.6511 8.592V7.856H16.2671ZM26.5231 16L26.6991 14.64L27.8191 14.88C27.9258 14.9013 28.0058 14.944 28.0591 15.008C28.1125 15.072 28.1391 15.1573 28.1391 15.264V16H26.5231ZM32.7914 16.112C32.002 16.112 31.3087 15.936 30.7114 15.584C30.1247 15.2213 29.666 14.7147 29.3354 14.064C29.0154 13.4133 28.8554 12.6453 28.8554 11.76C28.8554 11.0027 29.01 10.32 29.3194 9.712C29.6394 9.09333 30.0874 8.608 30.6634 8.256C31.25 7.904 31.9327 7.728 32.7114 7.728C33.394 7.728 33.9914 7.87733 34.5034 8.176C35.0154 8.47467 35.4154 8.896 35.7034 9.44C35.9914 9.984 36.1354 10.6347 36.1354 11.392C36.1354 11.6373 36.1087 11.8027 36.0554 11.888C36.002 11.9733 35.8954 12.016 35.7354 12.016H30.4554C30.4554 12.048 30.4554 12.08 30.4554 12.112C30.4554 12.144 30.4554 12.176 30.4554 12.208C30.5194 13.0613 30.7647 13.7173 31.1914 14.176C31.618 14.6347 32.194 14.864 32.9194 14.864C33.2394 14.864 33.554 14.8 33.8634 14.672C34.1834 14.544 34.466 14.4213 34.7114 14.304C34.9674 14.176 35.154 14.112 35.2714 14.112C35.3994 14.112 35.5007 14.1547 35.5754 14.24L36.0234 14.832C35.7887 15.1307 35.49 15.376 35.1274 15.568C34.7647 15.76 34.3807 15.8987 33.9754 15.984C33.57 16.0693 33.1754 16.112 32.7914 16.112ZM30.5034 11.024H34.6954C34.6954 10.4053 34.5247 9.89867 34.1834 9.504C33.842 9.09867 33.362 8.896 32.7434 8.896C32.082 8.896 31.5647 9.08267 31.1914 9.456C30.818 9.82933 30.5887 10.352 30.5034 11.024ZM38.241 16V4.176H39.841V16H38.241ZM37.073 16V15.264C37.073 15.1573 37.0997 15.072 37.153 15.008C37.2063 14.944 37.2863 14.9013 37.393 14.88L38.497 14.64L38.689 16H37.073ZM39.377 16L39.569 14.64L40.689 14.88C40.785 14.9013 40.8597 14.944 40.913 15.008C40.9663 15.072 40.993 15.1573 40.993 15.264V16H39.377ZM38.689 4.176L38.497 5.536L37.393 5.296C37.2863 5.27467 37.2063 5.232 37.153 5.168C37.0997 5.104 37.073 5.01867 37.073 4.912V4.176H38.689ZM42.9129 16V7.856H44.5129V16H42.9129ZM41.7449 16V15.264C41.7449 15.1573 41.7715 15.072 41.8249 15.008C41.8782 14.944 41.9582 14.9013 42.0649 14.88L43.1689 14.64L43.3609 16H41.7449ZM44.0489 16L44.2409 14.64L45.3609 14.88C45.4569 14.9013 45.5315 14.944 45.5849 15.008C45.6382 15.072 45.6649 15.1573 45.6649 15.264V16H44.0489ZM43.3609 7.856L43.1689 9.216L42.0649 8.976C41.9582 8.95467 41.8782 8.912 41.8249 8.848C41.7715 8.784 41.7449 8.69867 41.7449 8.592V7.856H43.3609ZM43.6969 6.432C43.4089 6.432 43.1529 6.32533 42.9289 6.112C42.7155 5.89867 42.6089 5.648 42.6089 5.36C42.6089 5.06133 42.7155 4.80533 42.9289 4.592C43.1529 4.368 43.4089 4.256 43.6969 4.256C43.9955 4.256 44.2515 4.368 44.4649 4.592C44.6889 4.80533 44.8009 5.06133 44.8009 5.36C44.8009 5.648 44.6889 5.89867 44.4649 6.112C44.2515 6.32533 43.9955 6.432 43.6969 6.432ZM47.5223 16V7.856H48.4823C48.7063 7.856 48.8449 7.96267 48.8983 8.176L49.0103 8.992C49.3623 8.608 49.7516 8.304 50.1783 8.08C50.6049 7.84533 51.1009 7.728 51.6663 7.728C52.2636 7.728 52.7596 7.856 53.1543 8.112C53.5596 8.368 53.8689 8.73067 54.0823 9.2C54.2956 9.66933 54.4023 10.208 54.4023 10.816V16H52.7863V10.816C52.7863 10.24 52.6529 9.792 52.3863 9.472C52.1303 9.152 51.7303 8.992 51.1863 8.992C50.7916 8.992 50.4183 9.088 50.0663 9.28C49.7249 9.46133 49.4103 9.71733 49.1223 10.048V16H47.5223ZM46.3543 16V15.264C46.3543 15.1573 46.3809 15.072 46.4342 15.008C46.4876 14.944 46.5676 14.9013 46.6743 14.88L47.7783 14.64L47.9703 16H46.3543ZM48.6583 16L48.8503 14.64L49.9703 14.88C50.0663 14.9013 50.1409 14.944 50.1943 15.008C50.2476 15.072 50.2743 15.1573 50.2743 15.264V16H48.6583ZM53.9383 16L54.1302 14.64L55.2503 14.88C55.3463 14.9013 55.4209 14.944 55.4743 15.008C55.5276 15.072 55.5543 15.1573 55.5543 15.264V16H53.9383ZM47.9703 7.856L47.7783 9.216L46.6743 8.976C46.5676 8.95467 46.4876 8.912 46.4342 8.848C46.3809 8.784 46.3543 8.69867 46.3543 8.592V7.856H47.9703ZM60.2289 16.112C59.4395 16.112 58.7462 15.936 58.1489 15.584C57.5622 15.2213 57.1035 14.7147 56.7729 14.064C56.4529 13.4133 56.2929 12.6453 56.2929 11.76C56.2929 11.0027 56.4475 10.32 56.7569 9.712C57.0769 9.09333 57.5249 8.608 58.1009 8.256C58.6875 7.904 59.3702 7.728 60.1489 7.728C60.8315 7.728 61.4289 7.87733 61.9409 8.176C62.4529 8.47467 62.8529 8.896 63.1409 9.44C63.4289 9.984 63.5729 10.6347 63.5729 11.392C63.5729 11.6373 63.5462 11.8027 63.4929 11.888C63.4395 11.9733 63.3329 12.016 63.1729 12.016H57.8929C57.8929 12.048 57.8929 12.08 57.8929 12.112C57.8929 12.144 57.8929 12.176 57.8929 12.208C57.9569 13.0613 58.2022 13.7173 58.6289 14.176C59.0555 14.6347 59.6315 14.864 60.3569 14.864C60.6769 14.864 60.9915 14.8 61.3009 14.672C61.6209 14.544 61.9035 14.4213 62.1489 14.304C62.4049 14.176 62.5915 14.112 62.7089 14.112C62.8369 14.112 62.9382 14.1547 63.0129 14.24L63.4609 14.832C63.2262 15.1307 62.9275 15.376 62.5649 15.568C62.2022 15.76 61.8182 15.8987 61.4129 15.984C61.0075 16.0693 60.6129 16.112 60.2289 16.112ZM57.9409 11.024H62.1329C62.1329 10.4053 61.9622 9.89867 61.6209 9.504C61.2795 9.09867 60.7995 8.896 60.1809 8.896C59.5195 8.896 59.0022 9.08267 58.6289 9.456C58.2555 9.82933 58.0262 10.352 57.9409 11.024Z" fill="#F3F3F3"/>
              <rect x="69" width="76" height="22" rx="4" fill="#2563EB" fillOpacity="0.4"/>
              <rect x="71" y="2" width="6" height="18" rx="3" fill="#2563EB"/>
              <path d="M84.8556 6.504H85.8996L89.5356 15H88.1916L87.3396 12.9H83.2956L82.4556 15H81.1116L84.8556 6.504ZM86.9196 11.892L85.3356 7.992H85.3116L83.7036 11.892H86.9196ZM96.5568 8.34C96.3168 8.028 96.0128 7.788 95.6448 7.62C95.2768 7.452 94.8968 7.368 94.5048 7.368C94.0248 7.368 93.5888 7.46 93.1968 7.644C92.8128 7.82 92.4808 8.064 92.2008 8.376C91.9288 8.688 91.7168 9.056 91.5648 9.48C91.4128 9.896 91.3368 10.344 91.3368 10.824C91.3368 11.272 91.4088 11.696 91.5528 12.096C91.6968 12.496 91.9048 12.848 92.1768 13.152C92.4488 13.456 92.7808 13.696 93.1728 13.872C93.5648 14.048 94.0088 14.136 94.5048 14.136C94.9928 14.136 95.4208 14.036 95.7888 13.836C96.1568 13.636 96.4688 13.356 96.7248 12.996L97.6968 13.728C97.6328 13.816 97.5208 13.944 97.3608 14.112C97.2008 14.272 96.9888 14.436 96.7248 14.604C96.4608 14.764 96.1408 14.904 95.7648 15.024C95.3968 15.152 94.9688 15.216 94.4808 15.216C93.8088 15.216 93.2008 15.088 92.6568 14.832C92.1208 14.576 91.6608 14.24 91.2768 13.824C90.9008 13.408 90.6128 12.94 90.4128 12.42C90.2128 11.892 90.1128 11.36 90.1128 10.824C90.1128 10.168 90.2208 9.564 90.4368 9.012C90.6528 8.452 90.9528 7.972 91.3368 7.572C91.7288 7.164 92.1968 6.848 92.7408 6.624C93.2848 6.4 93.8848 6.288 94.5408 6.288C95.1008 6.288 95.6488 6.396 96.1848 6.612C96.7288 6.828 97.1728 7.16 97.5168 7.608L96.5568 8.34ZM101.754 6.504H102.798L106.434 15H105.09L104.238 12.9H100.194L99.354 15H98.01L101.754 6.504ZM103.818 11.892L102.234 7.992H102.21L100.602 11.892H103.818ZM107.347 6.504H110.311C110.911 6.504 111.435 6.572 111.883 6.708C112.339 6.844 112.731 7.028 113.059 7.26C113.395 7.484 113.671 7.744 113.887 8.04C114.111 8.336 114.287 8.64 114.415 8.952C114.543 9.264 114.635 9.576 114.691 9.888C114.747 10.2 114.775 10.488 114.775 10.752C114.775 11.296 114.675 11.824 114.475 12.336C114.275 12.84 113.979 13.292 113.587 13.692C113.195 14.084 112.707 14.4 112.123 14.64C111.547 14.88 110.879 15 110.119 15H107.347V6.504ZM108.499 13.92H109.951C110.439 13.92 110.899 13.856 111.331 13.728C111.771 13.592 112.155 13.392 112.483 13.128C112.811 12.864 113.071 12.536 113.263 12.144C113.455 11.744 113.551 11.28 113.551 10.752C113.551 10.48 113.507 10.164 113.419 9.804C113.331 9.436 113.163 9.088 112.915 8.76C112.675 8.432 112.339 8.156 111.907 7.932C111.475 7.7 110.915 7.584 110.227 7.584H108.499V13.92ZM116.434 6.504H121.918V7.584H117.586V10.116H121.618V11.196H117.586V13.92H122.134V15H116.434V6.504ZM123.686 6.504H125.402L128.102 12.936H128.15L130.826 6.504H132.542V15H131.39V8.016H131.366L128.498 15H127.73L124.862 8.016H124.838V15H123.686V6.504ZM136.649 11.376L133.433 6.504H134.909L137.225 10.236L139.613 6.504H141.017L137.801 11.376V15H136.649V11.376Z" fill="white"/>
            </svg>
          </div>
        </div>

        {/* Right side - Controls */}
        <div className="flex items-center gap-4">
          <button
            onClick={handleVideoTutorialClick}
            className="text-[#A770EC] hover:text-[#B68FF0] transition-colors text-sm font-medium"
          >
            Quick Tutorial
          </button>

          <button
            onClick={handleFeedbackClick}
            className="text-gray-400 hover:text-white transition-colors text-sm"
          >
            Feedback
          </button>

          <button
            onClick={handlePresentMode}
            className="text-gray-400 hover:text-white transition-colors text-sm"
            disabled={!timelineId}
          >
            Present Mode
          </button>

          <button
            onClick={handleShare}
            disabled={!timelineId}
            className="px-4 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Share
          </button>
        </div>
      </div>

      {/* Feedback Panel */}
      <div 
        className={`fixed inset-0 bg-black/50 z-40 transition-opacity duration-250 ease-in-out ${
          isHelpOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => setIsHelpOpen(false)}
      />
      
      <div 
        className={`fixed right-0 top-0 h-full w-[400px] min-w-[360px] bg-gray-800 z-50 shadow-xl transform transition-transform duration-250 ease-in-out ${
          isHelpOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-700">
          <h2 className="text-xl font-semibold text-white">Feedback</h2>
          <button
            onClick={() => setIsHelpOpen(false)}
            className="text-gray-400 hover:text-white transition-colors p-2 rounded-full hover:bg-gray-700"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 text-gray-300 space-y-4">
          <p className="text-white font-medium">Hi, I'm Alex.</p>
          
          <p>
            I'm obsessed with timelines and how they transform the way we understand information. They turn isolated moments into visual stories that reveal hidden patterns and connections.
          </p>
          
          <p>
            Timeline.academy is my attempt to create the timeline tool I've always wanted - one that's visually clean, simple to manage, and functionally intuitive.
          </p>

          <p>
            I'm looking for feedback! The best products grow through their community. I'd love to hear your thoughts on how to make timeline.academy better – your feedback will help shape its future.
          </p>

          <p>
            Thanks!
          </p>

          <div className="pt-4 space-y-3">
            <button
              onClick={handleEmailClick}
              className="w-full py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              Give Feedback
            </button>

            <a 
              href="https://buymeacoffee.com/ttjs81madp" 
              target="_blank" 
              rel="noopener noreferrer"
              className="w-full py-2 px-4 bg-gray-700 text-white rounded-md hover:bg-gray-600 transition-colors flex items-center justify-center gap-2"
            >
              Buy me a coffee
            </a>
          </div>
        </div>
      </div>

      {/* Video Tutorial Modal */}
      <Modal
        isOpen={isVideoTutorialOpen}
        onClose={() => setIsVideoTutorialOpen(false)}
        title="Quick Tutorial to Get Started"
      >
        <div className="space-y-4">
          <p className="text-gray-300">
            This video tutorial walks through how to start building your timeline by adding events, editing categories, customizing timeline settings, and importing or exporting data to build faster.
          </p>
          
          <div className="aspect-video">
            <a 
              href="https://www.loom.com/share/f19575818a9341d4a266c482af981ba2" 
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full h-full bg-gray-700 rounded-lg flex items-center justify-center text-white hover:bg-gray-600 transition-colors"
            >
              <div className="text-center p-6">
                <Video size={48} className="mx-auto mb-4" />
                <p>Click to watch the tutorial video on Loom</p>
                <p className="text-sm text-gray-400 mt-2">The video will open in a new tab</p>
              </div>
            </a>
          </div>
        </div>
      </Modal>
    </div>
  );
}