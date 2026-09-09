package com.superfunteam.walky;

/** The one-cell button shares the large widget's queue and sync lifecycle. */
public class WalkButtonWidget extends WalkWidget {
  @Override
  protected boolean isCompact() {
    return true;
  }
}
