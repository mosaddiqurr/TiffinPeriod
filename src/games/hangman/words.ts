import type { Bi } from '../../platform/i18n';

// Word lists for Hangman. Bangla and English lists are written separately
// (they are not translations of each other), so both feel natural.

export interface Category { id: string; name: Bi; bn: string[]; en: string[] }

export const CATEGORIES: Category[] = [
  { id: 'fruit', name: { bn: 'ফল', en: 'Fruits' },
    bn: ['আম', 'কাঁঠাল', 'লিচু', 'পেয়ারা', 'কলা', 'আনারস', 'তরমুজ', 'জাম', 'বেল', 'কমলা', 'নারকেল', 'পেঁপে', 'আমড়া', 'জলপাই', 'বরই', 'ডালিম', 'আতা', 'লটকন', 'কামরাঙা', 'জামরুল'],
    en: ['MANGO', 'JACKFRUIT', 'LYCHEE', 'GUAVA', 'BANANA', 'PINEAPPLE', 'WATERMELON', 'ORANGE', 'COCONUT', 'PAPAYA', 'POMEGRANATE', 'GRAPES', 'APPLE', 'OLIVE', 'STARFRUIT', 'PLUM', 'CHERRY', 'LEMON', 'APRICOT', 'BLACKBERRY'] },
  { id: 'animal', name: { bn: 'প্রাণী', en: 'Animals' },
    bn: ['বাঘ', 'হাতি', 'হরিণ', 'বানর', 'গরু', 'ছাগল', 'বিড়াল', 'কুকুর', 'ঘোড়া', 'মহিষ', 'শিয়াল', 'খরগোশ', 'কুমির', 'কচ্ছপ', 'ভালুক', 'জিরাফ', 'উট', 'ইঁদুর', 'গন্ডার', 'সিংহ'],
    en: ['TIGER', 'ELEPHANT', 'DEER', 'MONKEY', 'BUFFALO', 'CROCODILE', 'TORTOISE', 'RABBIT', 'GIRAFFE', 'CAMEL', 'ZEBRA', 'KANGAROO', 'PENGUIN', 'DOLPHIN', 'LEOPARD', 'SQUIRREL', 'HIPPO', 'RHINOCEROS', 'PANDA', 'JACKAL'] },
  { id: 'bird', name: { bn: 'পাখি', en: 'Birds' },
    bn: ['দোয়েল', 'শালিক', 'ময়না', 'টিয়া', 'কাক', 'চড়ুই', 'বক', 'মাছরাঙা', 'কোকিল', 'ঘুঘু', 'পেঁচা', 'বাবুই', 'কবুতর', 'হাঁস', 'মুরগি', 'ময়ূর', 'চিল', 'বুলবুলি', 'টুনটুনি', 'কাঠঠোকরা'],
    en: ['PARROT', 'SPARROW', 'KINGFISHER', 'PEACOCK', 'PIGEON', 'CROW', 'OWL', 'EAGLE', 'HERON', 'MYNA', 'CUCKOO', 'DOVE', 'DUCK', 'SWAN', 'WOODPECKER', 'OSTRICH', 'FLAMINGO', 'HAWK', 'SEAGULL', 'BULBUL'] },
  { id: 'country', name: { bn: 'দেশ', en: 'Countries' },
    bn: ['বাংলাদেশ', 'ভারত', 'নেপাল', 'ভুটান', 'চীন', 'জাপান', 'মিশর', 'ইরান', 'তুরস্ক', 'ফ্রান্স', 'জার্মানি', 'ব্রাজিল', 'কানাডা', 'রাশিয়া', 'মালয়েশিয়া', 'আর্জেন্টিনা', 'শ্রীলঙ্কা', 'ইতালি', 'স্পেন', 'মরক্কো'],
    en: ['BANGLADESH', 'INDIA', 'NEPAL', 'BHUTAN', 'CHINA', 'JAPAN', 'EGYPT', 'BRAZIL', 'CANADA', 'FRANCE', 'GERMANY', 'ITALY', 'SPAIN', 'ARGENTINA', 'MALAYSIA', 'AUSTRALIA', 'NIGERIA', 'MEXICO', 'SWEDEN', 'PORTUGAL'] },
  { id: 'school', name: { bn: 'স্কুলের জিনিস', en: 'School things' },
    bn: ['খাতা', 'কলম', 'পেনসিল', 'রাবার', 'স্কেল', 'বই', 'ব্যাগ', 'টিফিন', 'ঘণ্টা', 'বেঞ্চ', 'চক', 'ডাস্টার', 'ব্ল্যাকবোর্ড', 'শার্পনার', 'পানির বোতল', 'ইউনিফর্ম', 'রুটিন', 'পরীক্ষা', 'ছুটি', 'জ্যামিতি বক্স'],
    en: ['NOTEBOOK', 'PENCIL', 'ERASER', 'RULER', 'SHARPENER', 'BLACKBOARD', 'CHALK', 'DUSTER', 'SCHOOL BAG', 'TIFFIN BOX', 'UNIFORM', 'BENCH', 'LIBRARY', 'TEACHER', 'HOMEWORK', 'EXAM', 'HOLIDAY', 'ASSEMBLY', 'GEOMETRY BOX', 'TIMETABLE'] },
  { id: 'food', name: { bn: 'খাবার', en: 'Food' },
    bn: ['ভাত', 'ডাল', 'খিচুড়ি', 'বিরিয়ানি', 'পিঠা', 'ফুচকা', 'চটপটি', 'সিঙাড়া', 'সমুচা', 'রসগোল্লা', 'মিষ্টি', 'পায়েস', 'হালিম', 'জিলাপি', 'মুড়ি', 'চানাচুর', 'ঝালমুড়ি', 'পরোটা', 'ইলিশ', 'দই'],
    en: ['RICE', 'LENTILS', 'KHICHURI', 'BIRYANI', 'PITHA', 'FUCHKA', 'SAMOSA', 'SINGARA', 'JALEBI', 'SWEETS', 'HALEEM', 'PARATHA', 'HILSA', 'YOGURT', 'CHOTPOTI', 'PAYESH', 'RASGULLA', 'MURI', 'CHANACHUR', 'KEBAB'] },
  { id: 'place', name: { bn: 'বাংলাদেশের জায়গা', en: 'Places in Bangladesh' },
    bn: ['ঢাকা', 'চট্টগ্রাম', 'সিলেট', 'খুলনা', 'রাজশাহী', 'বরিশাল', 'রংপুর', 'ময়মনসিংহ', 'কক্সবাজার', 'কুমিল্লা', 'বগুড়া', 'সুন্দরবন', 'রাঙামাটি', 'বান্দরবান', 'পদ্মা', 'যমুনা', 'মেঘনা', 'সোনারগাঁও', 'কুয়াকাটা', 'শ্রীমঙ্গল'],
    en: ['DHAKA', 'CHATTOGRAM', 'SYLHET', 'KHULNA', 'RAJSHAHI', 'BARISHAL', 'RANGPUR', 'MYMENSINGH', "COX'S BAZAR", 'CUMILLA', 'BOGURA', 'SUNDARBANS', 'RANGAMATI', 'BANDARBAN', 'PADMA', 'JAMUNA', 'MEGHNA', 'SONARGAON', 'KUAKATA', 'SREEMANGAL'] },
  { id: 'sport', name: { bn: 'খেলাধুলা', en: 'Games and sport' },
    bn: ['ক্রিকেট', 'ফুটবল', 'হাডুডু', 'কাবাডি', 'দাবা', 'লুডু', 'গোল্লাছুট', 'কানামাছি', 'ব্যাডমিন্টন', 'সাঁতার', 'দৌড়', 'ঘুড়ি', 'মার্বেল', 'ক্যারম', 'ব্যাট', 'উইকেট', 'গোলকিপার', 'পেনাল্টি', 'ছক্কা', 'বাউন্ডারি'],
    en: ['CRICKET', 'FOOTBALL', 'KABADDI', 'HADUDU', 'CHESS', 'LUDO', 'BADMINTON', 'SWIMMING', 'CARROM', 'MARBLES', 'KITE', 'WICKET', 'BOUNDARY', 'PENALTY', 'GOALKEEPER', 'UMPIRE', 'TROPHY', 'GOLLACHUT', 'KANAMACHI', 'TUG OF WAR'] },
];
