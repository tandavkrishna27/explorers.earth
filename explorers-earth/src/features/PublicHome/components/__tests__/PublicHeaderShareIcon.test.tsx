import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { PublicHeaderShareIcon } from "../PublicBranding";
import { PublicHeaderDescriptorProvider, usePublicHeaderDescriptor } from "../PublicHeaderDescriptorContext";
import { PublicProfileFixedHeader } from "../PublicProfileChromePrimitives";

describe("public header share icon", () => {
  it('emits Books header share only after the same route becomes usable',()=>{
    const track=vi.fn();Object.defineProperty(navigator,'share',{configurable:true,value:vi.fn(async()=>undefined)});
    function Surface({ready}:{ready:boolean}) { const location=useLocation();usePublicHeaderDescriptor({navigationKey:location.key,title:'Books',url:'http://localhost/alice/books',analyticsContext:'books-header',analyticsReady:ready});return <PublicProfileFixedHeader onTrackClick={track}/>; }
    const ui=(ready:boolean)=><MemoryRouter initialEntries={['/alice/books']}><PublicHeaderDescriptorProvider username='alice'><Surface ready={ready}/></PublicHeaderDescriptorProvider></MemoryRouter>;
    const view=render(ui(false));fireEvent.click(screen.getByRole('button',{name:'Share'}));expect(track).not.toHaveBeenCalled();view.rerender(ui(true));fireEvent.click(screen.getByRole('button',{name:'Share'}));expect(track).toHaveBeenCalledExactlyOnceWith('share-button',{context:'books-header'});
  });
  it('shares the Books fallback without emitting telemetry before a usable descriptor',()=>{
    const track=vi.fn();Object.defineProperty(navigator,'share',{configurable:true,value:vi.fn(async()=>undefined)});
    render(<MemoryRouter initialEntries={['/alice/books']}><PublicHeaderDescriptorProvider username='alice'><PublicProfileFixedHeader onTrackClick={track}/></PublicHeaderDescriptorProvider></MemoryRouter>);
    fireEvent.click(screen.getByRole('button',{name:'Share'}));expect(track).not.toHaveBeenCalled();
  });
  it("uses one consistent 20px Share2 glyph", () => {
    const { container } = render(<PublicHeaderShareIcon />);
    const icon = container.querySelector("[data-public-header-share-icon]");

    expect(icon).toBeInTheDocument();
    expect(icon).toHaveAttribute("width", "20");
    expect(icon).toHaveAttribute("height", "20");
    expect(icon).toHaveAttribute("aria-hidden", "true");
  });

  it("keeps the icon-only profile header action at a 44px touch target", () => {
    render(
      <MemoryRouter>
        <PublicHeaderDescriptorProvider origin="https://explorers.earth" username="alice" profileName="Alice">
          <PublicProfileFixedHeader onTrackClick={vi.fn()} />
        </PublicHeaderDescriptorProvider>
      </MemoryRouter>,
    );

    const share = screen.getByRole("button", { name: "Share" });
    expect(share).toHaveClass("min-h-11", "min-w-11");
    expect(share).toHaveTextContent("");
    expect(share.querySelector("[data-public-header-share-icon]")).toHaveAttribute("aria-hidden", "true");
  });
});
