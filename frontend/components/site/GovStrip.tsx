import Image from "next/image";
import emblem from "@/assets/images/emblem.jpg";
import GovTools from "./GovTools";

export default function GovStrip() {
  return (
    <div className="gov-strip">
      <div className="container gov-inner">
        <div className="gov-identity">
          <Image src={emblem} alt="Govt. of India" className="emblem" width={40} height={40} priority />
          <div>
            <strong>Government of India | Ministry of Culture</strong>
            <small>भारत सरकार | संस्कृति मंत्रालय</small>
          </div>
        </div>
        <GovTools />
      </div>
    </div>
  );
}
