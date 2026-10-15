"use client";

import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const COUNTRIES = [
  { value: "ua", label: "Україна" },
  { value: "cz", label: "Česko" },
  { value: "ro", label: "România" },
  { value: "pl", label: "Polska" },
];

const LANGUAGES = [
  { value: "en", label: "EN" },
  { value: "uk", label: "UK" },
];

export function ButtonsDemo() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 sb:grid-cols-3">
      <Button>Contained</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="link">Link</Button>
      <Button variant="destructive">Destructive</Button>
      <Button disabled>Disabled</Button>
      <Button size="sm" variant="outline">
        Small outline
      </Button>
      <Button className="w-full uppercase">Got it</Button>
    </div>
  );
}

export function FieldsDemo() {
  return (
    <div className="grid max-w-xl gap-4">
      <label className="grid gap-2 font-sans text-sm font-semibold">
        Name
        <Input placeholder="Олена Ковальчук" />
      </label>
      <label className="grid gap-2 font-sans text-sm font-semibold">
        Email (invalid)
        <Input aria-invalid defaultValue="not-an-email" />
        <span className="text-sm font-medium text-destructive">Enter a valid email</span>
      </label>
      <label className="grid gap-2 font-sans text-sm font-semibold">
        Disabled
        <Input disabled placeholder="Disabled" />
      </label>
      <div className="grid gap-2 font-sans text-sm font-semibold">
        Country
        <Select items={COUNTRIES} defaultValue="ua">
          <SelectTrigger className="w-full" aria-label="Country">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {COUNTRIES.map((country) => (
              <SelectItem key={country.value} value={country.value}>
                {country.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-3 font-sans text-sm font-semibold">
        Ghost select (header language)
        <Select items={LANGUAGES} defaultValue="en">
          <SelectTrigger variant="ghost" aria-label="Language">
            <SelectValue />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            {LANGUAGES.map((language) => (
              <SelectItem key={language.value} value={language.value}>
                {language.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <label className="flex items-center gap-3 font-sans text-sm font-semibold">
        <Switch defaultChecked /> In stock
      </label>
      <label className="flex items-center gap-3 font-sans text-sm font-semibold">
        <Switch size="sm" /> Small, off
      </label>
    </div>
  );
}

export function OverlaysDemo() {
  return (
    <div className="flex flex-wrap gap-4">
      <Dialog>
        <DialogTrigger render={<Button variant="outline" />}>Open dialog</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete product?</DialogTitle>
            <DialogDescription>Placeholder text. This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <DialogClose render={<Button />}>Confirm</DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Sheet>
        <SheetTrigger render={<Button variant="outline" />}>Open sheet</SheetTrigger>
        <SheetContent side="right" className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Filters</SheetTitle>
            <SheetDescription>Placeholder sheet content.</SheetDescription>
          </SheetHeader>
          <SheetFooter>
            <Button>Apply</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
      <Button variant="outline" onClick={() => toast.success("Added to cart")}>
        Success toast
      </Button>
      <Button variant="outline" onClick={() => toast.error("Something went wrong")}>
        Error toast
      </Button>
      <Button variant="outline" onClick={() => toast("Plain message")}>
        Plain toast
      </Button>
    </div>
  );
}

export function TabsDemo() {
  return (
    <Tabs defaultValue="sign-in" className="max-w-xl">
      <TabsList>
        <TabsTrigger value="sign-in">Sign in</TabsTrigger>
        <TabsTrigger value="sign-up">Sign up</TabsTrigger>
      </TabsList>
      <TabsContent value="sign-in">Sign-in panel placeholder.</TabsContent>
      <TabsContent value="sign-up">Sign-up panel placeholder.</TabsContent>
    </Tabs>
  );
}

export function BadgesDemo() {
  return (
    <div className="flex flex-wrap gap-3">
      <Badge>Default</Badge>
      <Badge variant="outline">Outline</Badge>
      <Badge variant="secondary">Secondary</Badge>
      <Badge variant="success">Available</Badge>
      <Badge variant="warning">Only order</Badge>
      <Badge variant="accent">New</Badge>
      <Badge variant="destructive">Cancelled</Badge>
    </div>
  );
}
