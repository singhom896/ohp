import type { StaticImageData } from "next/image";
import sufiNight from "@/assets/images/sufi-night.png";
import weddingNight from "@/assets/images/wedding-night.png";
import stateCulture from "@/assets/images/state-culture.jpg";

// `tone` values map to modifier classes in styles/frontend.css
// (they replace the old inline style="background:..." attributes).

export const categories = [
  { icon: "bi-music-note-beamed", tone: "tone-music", title: "Music", count: "1,245 opportunities" },
  { icon: "bi-person-arms-up", tone: "tone-dance", title: "Dance", count: "892 opportunities" },
  { icon: "bi-mask", tone: "tone-theatre", title: "Theatre", count: "456 opportunities" },
  { icon: "bi-flower1", tone: "tone-folk", title: "Folk & Traditional", count: "678 opportunities" },
  { icon: "bi-stars", tone: "tone-magic", title: "Magic & Illusion", count: "234 opportunities" },
  { icon: "bi-palette", tone: "tone-other", title: "Other Art Forms", count: "321 opportunities" },
];

export const stats = [
  { value: "25,000+", label: "Registered Artists" },
  { value: "8,500+", label: "Opportunities Posted" },
  { value: "3,200+", label: "Successful Bookings" },
  { value: "500+", label: "Cities Covered" },
];

export type Opportunity = {
  image: StaticImageData;
  tag: string;
  tagClass?: string;
  title: string;
  venue: string;
  date: string;
  time: string;
};

export const opportunities: Opportunity[] = [
  { image: sufiNight, tag: "Featured", title: "Live Sufi Night", venue: "Hotel Grand Palace, Jaipur", date: "20 May 2026", time: "7:00 PM" },
  { image: weddingNight, tag: "Wedding", tagClass: "tag-wedding", title: "Wedding Sangeet Performance", venue: "The Royal Garden, Lucknow", date: "2 Jun 2026", time: "6:30 PM" },
  { image: stateCulture, tag: "Government", tagClass: "tag-government", title: "State Cultural Festival", venue: "Ministry of Culture, Bhopal", date: "14 Jun 2026", time: "5:00 PM" },
];

export const steps = [
  { title: "Register", text: "Create your profile as an Artist or Organizer." },
  { title: "Explore", text: "Find or post opportunities that match your art." },
  { title: "Connect", text: "Discuss details directly and finalize terms." },
  { title: "Perform", text: "Deliver a memorable show and get discovered." },
];

export const galleryItems = [
  { variant: "tall", title: "Live Sufi Night", place: "Hotel Grand Palace, Jaipur" },
  { variant: "green", title: "Wedding Sangeet Reel", place: "The Royal Garden, Lucknow" },
  { variant: "purple", title: "Folk Troupe Performance", place: "Bhopal Cultural Festival" },
  { variant: "orange", title: "Classical Dance Recital", place: "Kalakshetra, Chennai" },
  { variant: "tall", title: "Republic Day Cultural Programme", place: "Ministry of Culture, New Delhi" },
  { variant: "green", title: "Street Theatre Showcase", place: "Mumbai" },
  { variant: "purple", title: "Magic & Illusion Act", place: "New Delhi" },
];

export type Testimonial = { quote: string; initials: string; tone: string; name: string; role: string };

export const artistTestimonials: Testimonial[] = [
  {
    quote: "I found three wedding season bookings in my first month here. The profile verification made organizers trust me faster than any reference call could.",
    initials: "RS", tone: "tone-wine", name: "Ritu Sharma", role: "Bharatanatyam Dancer, Chennai",
  },
  {
    quote: "My profile lets organizers understand my repertoire before they contact me. It has made finding the right performance opportunities much easier.",
    initials: "NK", tone: "tone-rose", name: "Neha Kapoor", role: "Classical Vocalist, Delhi",
  },
  {
    quote: "I can showcase my performances and receive relevant opportunities instead of spending hours searching across different channels.",
    initials: "AM", tone: "tone-amber", name: "Arjun Mehta", role: "Tabla Artist, Mumbai",
  },
];

export const organizerTestimonials: Testimonial[] = [
  {
    quote: "Sourcing folk performers for our government programme used to take weeks of phone calls. Now I filter by art form and city and shortlist in an afternoon.",
    initials: "AK", tone: "tone-teal", name: "Anil Kumar", role: "Event Coordinator, Ministry of Culture",
  },
  {
    quote: "As a hotel banquet manager, I book live music almost every weekend. Having verified tabla and sitar artists in one place has cut our planning time in half.",
    initials: "PM", tone: "tone-violet", name: "Priya Menon", role: "Banquet Manager, Hotel Grand Palace",
  },
  {
    quote: "We can compare artists by art form, city and experience before reaching out. That makes event planning faster and much more structured.",
    initials: "RS", tone: "tone-green", name: "Rahul Singh", role: "Events Manager, Heritage Group",
  },
];
